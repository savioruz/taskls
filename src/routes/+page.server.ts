import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
	getStore,
	saveReport,
	checkAndSendToDiscord,
	getEmployeesList,
	formatIndonesianDate
} from '$lib/server/store';

export const load: PageServerLoad = async () => {
	const store = await getStore();
	const employees = getEmployeesList();

	return {
		employees,
		submissions: store.submissions,
		discordSent: store.discordSent,
		todayDate: store.date,
		todayDateFormatted: formatIndonesianDate(store.date)
	};
};

export const actions: Actions = {
	default: async ({ request }) => {
		const data = await request.formData();
		const employeeName = data.get('employeeName')?.toString().trim();
		const tasksStr = data.get('tasks')?.toString();

		// Validation
		if (!employeeName) {
			return fail(400, {
				error: 'Nama karyawan harus dipilih.',
				values: { employeeName }
			});
		}

		const employees = getEmployeesList();
		if (!employees.includes(employeeName)) {
			return fail(400, {
				error: 'Nama karyawan tidak terdaftar.',
				values: { employeeName }
			});
		}

		let tasks: Array<{ text: string; status: string }> = [];
		try {
			if (tasksStr) {
				tasks = JSON.parse(tasksStr);
			}
		} catch (e) {
			return fail(400, {
				error: 'Format data task tidak valid.',
				values: { employeeName }
			});
		}

		if (!Array.isArray(tasks) || tasks.length === 0) {
			return fail(400, {
				error: 'Task tidak boleh kosong.',
				values: { employeeName }
			});
		}

		const validStatuses = ['To-Do', 'In-Progress', 'Done', 'Obstacle'];
		for (let i = 0; i < tasks.length; i++) {
			const item = tasks[i];
			if (!item.text || !item.text.trim()) {
				return fail(400, {
					error: `Deskripsi task #${i + 1} tidak boleh kosong.`,
					values: { employeeName }
				});
			}
			if (!item.status || !validStatuses.includes(item.status)) {
				return fail(400, {
					error: `Status task #${i + 1} tidak valid.`,
					values: { employeeName }
				});
			}
		}

		try {
			// Save the report
			await saveReport(employeeName, tasks as any);

			// Check if all employees have submitted today, send webhook asynchronously in background
			checkAndSendToDiscord().catch((error) => {
				console.error('Async error in checkAndSendToDiscord:', error);
			});

			return {
				success: true,
				message: 'Laporan berhasil disimpan!'
			};
		} catch (error) {
			console.error('Server error handling submission:', error);
			return fail(500, {
				error: 'Terjadi kesalahan server internal. Silakan coba lagi.',
				values: { employeeName }
			});
		}
	}
};
