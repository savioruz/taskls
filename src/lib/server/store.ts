import fs from 'fs/promises';
import path from 'path';
import { env } from '$env/dynamic/private';
import OpenAI from 'openai';

export interface TaskReport {
	employeeName: string;
	task: string;
	status: 'To-Do' | 'In-Progress' | 'Done' | 'Obstacle';
	submittedAt: string;
}

export interface DailyStore {
	date: string; // YYYY-MM-DD
	submissions: Record<string, TaskReport>; // employeeName -> TaskReport
	discordSent: boolean;
}

const DATA_DIR = path.resolve('data');
const DATA_FILE = path.join(DATA_DIR, 'submissions.json');

// Get current date in UTC+7 (Asia/Jakarta)
export function getTodayDateString(): string {
	const d = new Date();
	// Adjust UTC time to UTC+7 timezone
	const utc = d.getTime() + d.getTimezoneOffset() * 60000;
	const jktDate = new Date(utc + 3600000 * 7);
	const yyyy = jktDate.getFullYear();
	const mm = String(jktDate.getMonth() + 1).padStart(2, '0');
	const dd = String(jktDate.getDate()).padStart(2, '0');
	return `${yyyy}-${mm}-${dd}`;
}

export async function getStore(): Promise<DailyStore> {
	const today = getTodayDateString();
	try {
		await fs.mkdir(DATA_DIR, { recursive: true });
		const data = await fs.readFile(DATA_FILE, 'utf-8');
		const store: DailyStore = JSON.parse(data);

		// Reset if it's a new day
		if (store.date !== today) {
			const newStore: DailyStore = {
				date: today,
				submissions: {},
				discordSent: false
			};
			await saveStore(newStore);
			return newStore;
		}
		return store;
	} catch (error) {
		// If file doesn't exist or contains invalid JSON
		const newStore: DailyStore = {
			date: today,
			submissions: {},
			discordSent: false
		};
		await saveStore(newStore);
		return newStore;
	}
}

async function saveStore(store: DailyStore): Promise<void> {
	await fs.mkdir(DATA_DIR, { recursive: true });
	await fs.writeFile(DATA_FILE, JSON.stringify(store, null, 2), 'utf-8');
}

export async function saveReport(
	employeeName: string,
	task: string,
	status: TaskReport['status']
): Promise<DailyStore> {
	const store = await getStore();
	const today = getTodayDateString();

	store.submissions[employeeName] = {
		employeeName,
		task,
		status,
		submittedAt: new Date().toISOString()
	};

	// If date changes on the system during submission, align it
	if (store.date !== today) {
		store.date = today;
	}

	await saveStore(store);
	return store;
}

export function getEmployeesList(): string[] {
	const employeesStr = env.EMPLOYEES || process.env.EMPLOYEES || '';
	return employeesStr
		.split(',')
		.map((name: string) => name.trim())
		.filter((name: string) => name.length > 0);
}

function getOpenAIClient(): OpenAI | null {
	const apiKey = env.AI_API_KEY || process.env.AI_API_KEY || env.OPENAI_API_KEY || process.env.OPENAI_API_KEY || '';
	if (!apiKey) {
		return null;
	}

	const baseURL = env.AI_BASE_URL || process.env.AI_BASE_URL || undefined;

	return new OpenAI({
		apiKey,
		baseURL: baseURL || undefined
	});
}

export async function generateAISummary(store: DailyStore): Promise<string | null> {
	const openai = getOpenAIClient();
	if (!openai) {
		console.warn('OpenAI SDK API key is missing. Skipping AI summarization.');
		return null;
	}

	const model = env.AI_MODEL || process.env.AI_MODEL || 'gpt-4o-mini';
	const employees = getEmployeesList();

	const reportList = employees
		.map((name) => {
			const report = store.submissions[name];
			if (report) {
				return `- **${name}** (Status: ${report.status}):\n  ${report.task.trim()}`;
			}
			return `- **${name}**: Belum mengumpulkan laporan harian.`;
		})
		.join('\n\n');

	const prompt = `Anda adalah asisten manajer proyek yang bertugas merangkum laporan kerja harian (Daily Task Report) dari tim developer.
Berikut adalah daftar pekerjaan harian karyawan pada tanggal ${formatIndonesianDate(store.date)}:

${reportList}

Tolong buatlah ringkasan eksekutif (Executive Summary) yang profesional, padat, dan informatif dalam Bahasa Indonesia.
Format ringkasan harus menggunakan markdown dengan ketentuan:
1. Ringkasan singkat keseluruhan kerja tim hari ini (2-3 kalimat).
2. Poin-poin pencapaian utama tim (Major Achievements) atau pekerjaan yang selesai (Done).
3. Poin-poin pekerjaan yang masih berjalan (In-Progress / To-Do).
4. Sorotan jika ada kendala/hambatan (Obstacles / Obstacle) secara jelas agar manajemen dapat membantu menyelesaikannya.

Tulis ringkasan secara ringkas langsung ke intinya, tanpa kalimat pembuka basa-basi seperti "Berikut ringkasan harian..." atau "Halo...". Langsung mulai dengan analisis/ringkasannya. Gunakan emoji secara proporsional agar menarik dibaca di Discord.`;

	try {
		const response = await openai.chat.completions.create({
			model,
			messages: [
				{
					role: 'system',
					content:
						'Anda adalah manajer proyek handal yang ahli merangkum laporan tim secara profesional dan ringkas.'
				},
				{ role: 'user', content: prompt }
			],
			temperature: 0.5
		});

		const summary = response.choices[0]?.message?.content;
		return summary || null;
	} catch (error) {
		console.error('Error generating AI Summary:', error);
		return null;
	}
}

export async function sendDiscordWebhook(store: DailyStore): Promise<boolean> {
	const webhookUrl = env.DISCORD_WEBHOOK_URL || process.env.DISCORD_WEBHOOK_URL;
	if (!webhookUrl || webhookUrl.includes('dummy-id') || webhookUrl === '') {
		console.warn('Discord Webhook URL is not configured or is a dummy. Skipping webhook call.');
		return false;
	}

	const employees = getEmployeesList();
	const submissionsCount = Object.keys(store.submissions).length;

	const statusEmoji = {
		'To-Do': '📝',
		'In-Progress': '🔄',
		'Done': '✅',
		'Obstacle': '⚠️'
	};

	// Generate AI Summary
	let aiSummary: string | null = null;
	try {
		aiSummary = await generateAISummary(store);
	} catch (error) {
		console.error('Graceful failure during AI Summary generation:', error);
	}

	// Prepare individual fields
	const fields = employees.map((name) => {
		const report = store.submissions[name];
		if (report) {
			return {
				name: `👤 ${name} (${statusEmoji[report.status]} ${report.status})`,
				value: report.task.trim(),
				inline: false
			};
		} else {
			return {
				name: `👤 ${name} (❌ Belum Lapor)`,
				value: '*Tidak ada laporan untuk hari ini.*',
				inline: false
			};
		}
	});

	const embeds: any[] = [];

	if (aiSummary) {
		embeds.push({
			title: '🤖 RANGKUMAN EKSEKUTIF AI (DAILY SUMMARY)',
			description: aiSummary,
			color: 16770304, // Bright yellow #FFE600
			footer: {
				text: 'Rangkuman otomatis dihasilkan oleh AI'
			},
			timestamp: new Date().toISOString()
		});

		embeds.push({
			title: '📋 DETAIL LAPORAN KARYAWAN',
			description: `**Progress Pengisian:** ${submissionsCount}/${employees.length} Karyawan`,
			color: 8246268, // Sky blue (#7dd3fc)
			fields: fields,
			footer: {
				text: 'TaskLS • Dikirim secara kolektif'
			}
		});
	} else {
		embeds.push({
			title: '📋 LAPORAN TUGAS HARIAN (DAILY TASK REPORT)',
			description: `**Tanggal:** ${formatIndonesianDate(store.date)}\n**Progress:** ${submissionsCount}/${employees.length} Karyawan`,
			color: 16770304, // Bright yellow #FFE600
			fields: fields,
			footer: {
				text: 'TaskLS • Dikirim secara kolektif'
			},
			timestamp: new Date().toISOString()
		});
	}

	const payload = {
		embeds: embeds
	};

	try {
		const response = await fetch(webhookUrl, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify(payload)
		});

		if (!response.ok) {
			const errText = await response.text();
			console.error(`Discord Webhook failed: ${response.status} ${response.statusText} - ${errText}`);
			return false;
		}

		return true;
	} catch (error) {
		console.error('Error sending to Discord Webhook:', error);
		return false;
	}
}

export async function checkAndSendToDiscord(): Promise<{ sent: boolean; message: string }> {
	const store = await getStore();
	if (store.discordSent) {
		return { sent: false, message: 'Laporan hari ini sudah dikirim ke Discord sebelumnya.' };
	}

	const employees = getEmployeesList();
	if (employees.length === 0) {
		return { sent: false, message: 'Tidak ada karyawan yang terkonfigurasi.' };
	}

	// Check if all configured employees have submitted
	const hasAllSubmitted = employees.every((name) => store.submissions[name] !== undefined);
	if (!hasAllSubmitted) {
		return { sent: false, message: 'Belum semua karyawan mengisi laporan.' };
	}

	const success = await sendDiscordWebhook(store);
	if (success) {
		store.discordSent = true;
		await saveStore(store);
		return { sent: true, message: 'Laporan berhasil dikirim ke Discord!' };
	} else {
		return { sent: false, message: 'Gagal mengirim laporan ke Discord. Silakan cek logs server.' };
	}
}

export function formatIndonesianDate(dateStr: string): string {
	const parts = dateStr.split('-');
	if (parts.length !== 3) return dateStr;
	const year = parts[0];
	const monthIdx = parseInt(parts[1], 10) - 1;
	const day = parts[2];

	const months = [
		'Januari',
		'Februari',
		'Maret',
		'April',
		'Mei',
		'Juni',
		'Juli',
		'Agustus',
		'September',
		'Oktober',
		'November',
		'Desember'
	];

	const d = new Date(parseInt(year, 10), monthIdx, parseInt(day, 10));
	const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
	const dayName = days[d.getDay()];

	return `${dayName}, ${parseInt(day, 10)} ${months[monthIdx]} ${year}`;
}
