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
		const task = data.get('task')?.toString().trim();
		const status = data.get('status')?.toString().trim();

		// Validation
		if (!employeeName) {
			return fail(400, {
				error: 'Nama karyawan harus dipilih.',
				values: { employeeName, task, status }
			});
		}

		const employees = getEmployeesList();
		if (!employees.includes(employeeName)) {
			return fail(400, {
				error: 'Nama karyawan tidak terdaftar.',
				values: { employeeName, task, status }
			});
		}

		if (!task) {
			return fail(400, {
				error: 'Deskripsi task/pekerjaan tidak boleh kosong.',
				values: { employeeName, task, status }
			});
		}

		const validStatuses = ['To-Do', 'In-Progress', 'Done', 'Obstacle'];
		if (!status || !validStatuses.includes(status)) {
			return fail(400, {
				error: 'Status pekerjaan tidak valid.',
				values: { employeeName, task, status }
			});
		}

		try {
			// Save the report
			await saveReport(employeeName, task, status as any);

			// Check if all employees have submitted today, send webhook if they have
			const result = await checkAndSendToDiscord();

			return {
				success: true,
				message: result.sent ? result.message : 'Laporan berhasil disimpan!'
			};
		} catch (error) {
			console.error('Server error handling submission:', error);
			return fail(500, {
				error: 'Terjadi kesalahan server internal. Silakan coba lagi.',
				values: { employeeName, task, status }
			});
		}
	}
};
