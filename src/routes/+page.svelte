<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { onMount } from 'svelte';

	let { data, form } = $props();

	// Form state variables using Svelte 5 Runes
	let submitting = $state(false);
	let selectedEmployee = $state('');
	let tasks = $state<Array<{ text: string; status: 'To-Do' | 'In-Progress' | 'Done' | 'Obstacle' }>>([
		{ text: '', status: 'Done' }
	]);

	function addTask() {
		tasks.push({ text: '', status: 'Done' });
	}

	function removeTask(index: number) {
		if (tasks.length > 1) {
			tasks.splice(index, 1);
		}
	}

	function parseGitLog(text: string): string[] {
		const lines = text.split(/\r?\n/);
		const messages: string[] = [];

		if (text.includes('commit ') && text.includes('Author:')) {
			let currentMessage = '';
			for (const line of lines) {
				if (line.startsWith('commit ')) {
					if (currentMessage.trim()) {
						messages.push(currentMessage.trim());
					}
					currentMessage = '';
				} else if (line.startsWith('Author:') || line.startsWith('Date:') || line.startsWith('Merge:')) {
					continue;
				} else {
					if (line.trim() === '') {
						continue;
					}
					currentMessage += (currentMessage ? '\n' : '') + line.trim();
				}
			}
			if (currentMessage.trim()) {
				messages.push(currentMessage.trim());
			}
		} else {
			const onelineRegex = /^[0-9a-f]{7,40}\s+(.*)$/i;
			const commitHashRegex = /^commit\s+[0-9a-f]{7,40}\s+(.*)$/i;

			for (const line of lines) {
				const cleanLine = line.trim();
				if (!cleanLine) continue;

				const matchOneline = cleanLine.match(onelineRegex);
				if (matchOneline) {
					let message = matchOneline[1].trim();
					message = message.replace(/^\([^)]+\)\s*/, '');
					messages.push(message);
					continue;
				}

				const matchCommitHash = cleanLine.match(commitHashRegex);
				if (matchCommitHash) {
					let message = matchCommitHash[1].trim();
					message = message.replace(/^\([^)]+\)\s*/, '');
					messages.push(message);
					continue;
				}
			}
		}

		return messages.filter((msg) => !/merge/i.test(msg));
	}

	function handlePaste(event: ClipboardEvent, index: number) {
		const pastedText = event.clipboardData?.getData('text') || '';
		const parsedMessages = parseGitLog(pastedText);

		if (parsedMessages.length > 0) {
			event.preventDefault();

			// Fill the first one in the current task
			tasks[index].text = parsedMessages[0];

			// Create the rest as new tasks
			const newTasks = parsedMessages.slice(1).map((msg) => ({
				text: msg,
				status: 'Done' as const
			}));

			if (newTasks.length > 0) {
				tasks.splice(index + 1, 0, ...newTasks);
			}
		}
	}

	function handleGlobalPaste(event: ClipboardEvent) {
		const target = event.target as HTMLElement;
		const tagName = target?.tagName?.toUpperCase();
		if (
			tagName === 'INPUT' ||
			tagName === 'TEXTAREA' ||
			target?.isContentEditable
		) {
			return;
		}

		const pastedText = event.clipboardData?.getData('text') || '';
		const parsedMessages = parseGitLog(pastedText);

		if (parsedMessages.length > 0) {
			event.preventDefault();

			tasks = parsedMessages.map((msg) => ({
				text: msg,
				status: 'Done' as const
			}));
		}
	}

	// Searchable Dropdown state variables
	let isOpen = $state(false);
	let searchQuery = $state('');
	let dropdownRef: HTMLDivElement | undefined = $state(undefined);

	// Derived list of employees filtered by query
	let filteredEmployees = $derived(
		data.employees.filter((employee: string) =>
			employee.toLowerCase().includes(searchQuery.toLowerCase())
		)
	);

	// Close dropdown when clicking outside of it
	function handleDocumentClick(event: MouseEvent) {
		if (dropdownRef && !dropdownRef.contains(event.target as Node)) {
			isOpen = false;
		}
	}

	// Clear task input and selection on success
	$effect(() => {
		if (form?.success) {
			tasks = [{ text: '', status: 'Done' }];
			selectedEmployee = '';
		}
	});

	// Polling: reload data every 10 seconds to keep all clients synchronized
	onMount(() => {
		const interval = setInterval(() => {
			invalidateAll();
		}, 10000);

		return () => clearInterval(interval);
	});

	// Computed reactivity using $derived
	let totalEmployees = $derived(data.employees.length);
	let submissionsList = $derived(Object.values(data.submissions));
	let submittedCount = $derived(submissionsList.length);
	let percentProgress = $derived(
		totalEmployees > 0 ? Math.round((submittedCount / totalEmployees) * 100) : 0
	);

	// Styling map for task statuses
	const statusConfig = {
		'To-Do': { bg: 'bg-brand-purple', emoji: '📝', text: 'To-Do' },
		'In-Progress': { bg: 'bg-brand-blue', emoji: '🔄', text: 'In Progress' },
		'Done': { bg: 'bg-brand-green', emoji: '✅', text: 'Done' },
		'Obstacle': { bg: 'bg-brand-red', emoji: '⚠️', text: 'Obstacle' }
	};
</script>

<svelte:head>
	<title>Daily Task Report - TaskLS</title>
</svelte:head>

<svelte:window onclick={handleDocumentClick} onpaste={handleGlobalPaste} />

<main class="min-h-screen p-4 md:p-8 flex flex-col items-center">
	<div class="w-full max-w-6xl flex flex-col gap-8">
		<!-- HEADER CARD -->
		<header class="bg-brand-yellow border-4 border-black p-6 md:p-8 neo-shadow-lg flex flex-col gap-6">
			<div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
				<div>
					<span
						class="bg-black text-white px-3 py-1 font-bold text-xs uppercase tracking-widest neo-border neo-shadow-sm inline-block mb-3"
						>INTERNAL TOOL</span
					>
					<h1 class="text-3xl md:text-5xl font-black tracking-tight leading-none uppercase">
						Daily Task Report
					</h1>
					<p class="text-sm md:text-base font-bold text-black/80 mt-1">
						Laporan Harian Kolektif Karyawan untuk Discord Webhook
					</p>
				</div>
				<div class="bg-white border-3 border-black px-4 py-3 font-extrabold text-center neo-shadow">
					<div class="text-xs uppercase tracking-wider text-gray-500">HARI INI</div>
					<div class="text-base md:text-lg">{data.todayDateFormatted}</div>
				</div>
			</div>

			<!-- Progress Bar Section -->
			<div class="border-t-3 border-black/20 pt-5">
				<div class="flex items-center justify-between font-extrabold mb-2 text-sm md:text-base">
					<span>PROGRESS PENGISIAN LAPORAN</span>
					<span class="bg-white border-2 border-black px-2 py-0.5"
						>{submittedCount} / {totalEmployees} Karyawan</span
					>
				</div>
				<div class="w-full bg-white border-3 border-black h-8 overflow-hidden flex relative">
					<div
						class="bg-brand-green h-full border-r-3 border-black transition-all duration-500 ease-out"
						style="width: {percentProgress}%"
					></div>
					<div
						class="absolute inset-0 flex items-center justify-center font-black text-xs md:text-sm mix-blend-difference text-white"
					>
						{percentProgress}% SELESAI
					</div>
				</div>
			</div>
		</header>

		<!-- DISCORD Webhook Integration Status Banners -->
		{#if data.discordSent}
			<div
				class="bg-brand-green border-4 border-black p-5 neo-shadow flex flex-col md:flex-row items-center justify-between gap-4"
			>
				<div class="flex items-center gap-3">
					<span class="text-3xl">🎉</span>
					<div>
						<h2 class="text-lg font-black uppercase">Laporan Selesai & Dikirim!</h2>
						<p class="text-sm font-semibold text-black/80">
							Semua karyawan ({submittedCount}/{totalEmployees}) telah mengisi laporan hari ini.
							Rangkuman telah sukses dipublish ke Discord Webhook.
						</p>
					</div>
				</div>
				<div
					class="bg-black text-brand-green px-4 py-2 border-2 border-black font-extrabold text-xs uppercase tracking-wider neo-shadow-sm shrink-0"
				>
					DISCORD COMPLETED
				</div>
			</div>
		{:else}
			<div
				class="bg-brand-blue border-4 border-black p-5 neo-shadow flex flex-col md:flex-row items-center justify-between gap-4"
			>
				<div class="flex items-center gap-3">
					<span class="text-3xl">⏳</span>
					<div>
						<h2 class="text-lg font-black uppercase">Menunggu Laporan Kolektif</h2>
						<p class="text-sm font-semibold text-black/80">
							Tersisa {totalEmployees - submittedCount} karyawan lagi yang belum submit. Laporan harian
							akan otomatis dikirim ke Discord setelah semua karyawan selesai lapor.
						</p>
					</div>
				</div>
				<div
					class="bg-white border-2 border-black px-4 py-2 font-extrabold text-xs uppercase tracking-wider neo-shadow-sm shrink-0"
				>
					WAITING FOR ALL
				</div>
			</div>
		{/if}

		<!-- GRID LAYOUT -->
		<div class="grid grid-cols-1 lg:grid-cols-12 gap-8">
			<!-- FORM COLUMN -->
			<section class="lg:col-span-5 flex flex-col gap-6">
				<div class="bg-white border-4 border-black p-6 neo-shadow">
					<h2
						class="text-xl font-black uppercase border-b-3 border-black pb-3 mb-5 flex items-center gap-2"
					>
						<span>📝</span> Isi Laporan Harian
					</h2>

					{#if form?.error}
						<div
							class="bg-brand-red border-3 border-black p-3 font-bold text-sm mb-5 neo-shadow-sm flex items-center gap-2"
						>
							<span>⚠️</span>
							{form.error}
						</div>
					{/if}

					{#if form?.success}
						<div
							class="bg-brand-green border-3 border-black p-3 font-bold text-sm mb-5 neo-shadow-sm flex items-center gap-2"
						>
							<span>✅</span>
							{form.message}
						</div>
					{/if}

					<form
						method="POST"
						use:enhance={() => {
							submitting = true;
							return async ({ update }) => {
								await update();
								submitting = false;
							};
						}}
						class="flex flex-col gap-5"
					>
						<!-- Searchable Custom Dropdown Selection -->
						<div class="flex flex-col gap-2" bind:this={dropdownRef}>
							<span class="font-extrabold text-sm uppercase tracking-wide">Pilih Nama Karyawan</span>
							<div class="relative">
								<!-- Hidden input so the value gets submitted normally by the HTML form -->
								<input type="hidden" name="employeeName" value={selectedEmployee} required />

								<!-- Dropdown Toggle Button -->
								<button
									id="employeeDropdownBtn"
									type="button"
									onclick={() => {
										isOpen = !isOpen;
										if (isOpen) searchQuery = '';
									}}
									class="w-full bg-white border-3 border-black p-3 font-extrabold flex justify-between items-center shadow-[3px_3px_0px_0px_#000] cursor-pointer text-sm outline-none focus:border-brand-yellow text-left"
								>
									<span>{selectedEmployee || 'Pilih nama Anda...'}</span>
									<div
										class="absolute inset-y-0 right-0 flex items-center px-4 border-l-3 border-black bg-brand-yellow h-full pointer-events-none"
									>
										<svg
											class="fill-current h-4 w-4 transition-transform duration-200 {isOpen
												? 'rotate-180'
												: ''}"
											xmlns="http://www.w3.org/2000/svg"
											viewBox="0 0 20 20"
										>
											<path
												d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
											/>
										</svg>
									</div>
								</button>

								<!-- Dropdown Menu -->
								{#if isOpen}
									<div
										class="absolute z-20 left-0 right-0 mt-2 bg-white border-3 border-black shadow-[4px_4px_0px_0px_#000] flex flex-col p-3 gap-2"
									>
										<!-- Search Input -->
										<div class="relative">
											<input
												id="employeeSearchInput"
												type="text"
												bind:value={searchQuery}
												placeholder="Cari nama karyawan..."
												class="w-full bg-white border-2 border-black p-2 font-semibold text-xs outline-none focus:bg-yellow-50/50"
												autocomplete="off"
											/>
											<span class="absolute right-2.5 top-2 text-xs opacity-40">🔍</span>
										</div>

										<!-- Options List -->
										<div
											class="max-h-48 overflow-y-auto flex flex-col gap-1 pr-1 border-t-2 border-black/10 pt-2 mt-1"
										>
											{#if filteredEmployees.length === 0}
												<div class="p-2 text-center text-xs font-bold text-gray-400 uppercase">
													Karyawan Tidak Ditemukan
												</div>
											{:else}
												{#each filteredEmployees as employee}
													{@const hasSubmitted = data.submissions[employee] !== undefined}
													<button
														type="button"
														disabled={hasSubmitted}
														onclick={() => {
															selectedEmployee = employee;
															isOpen = false;
															searchQuery = '';
														}}
														class="w-full text-left p-2 font-bold text-xs flex justify-between items-center transition-colors border border-transparent hover:border-black
																	 {hasSubmitted
																			? 'bg-gray-100/70 text-gray-400 cursor-not-allowed'
																			: 'bg-white hover:bg-brand-yellow/20 cursor-pointer'}"
													>
														<span>{employee}</span>
														{#if hasSubmitted}
															<span
																class="text-[10px] font-black text-brand-green bg-white border-2 border-black px-1.5 py-0.2 shadow-[1px_1px_0px_0px_#000]"
																>SUDAH LAPOR ✓</span
															>
														{/if}
													</button>
												{/each}
											{/if}
										</div>
									</div>
								{/if}
							</div>
						</div>

						<!-- Hidden input serialize tasks array to JSON -->
						<input type="hidden" name="tasks" value={JSON.stringify(tasks)} />

						<!-- Pekerjaan / Task Description Array -->
						<div class="flex flex-col gap-4">
							<div class="flex items-center justify-between border-b-3 border-black pb-2">
								<span class="font-extrabold text-sm uppercase tracking-wide">Daftar Task / Pekerjaan Hari Ini</span>
								<button
									type="button"
									onclick={addTask}
									class="bg-brand-blue border-2 border-black px-2.5 py-1 text-xs font-black uppercase shadow-[2px_2px_0px_0px_#000] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[1px_1px_0px_0px_#000] cursor-pointer"
								>
									+ Tambah Task
								</button>
							</div>

							{#each tasks as task, index}
								<div class="border-3 border-black p-4 bg-gray-50 flex flex-col gap-4 relative neo-shadow-sm">
									<div class="flex items-center justify-between border-b-2 border-black/10 pb-2">
										<span class="font-black text-xs uppercase text-gray-500">Task #{index + 1}</span>
										{#if tasks.length > 1}
											<button
												type="button"
												onclick={() => removeTask(index)}
												class="bg-brand-red text-white border-2 border-black px-2 py-0.5 text-[10px] font-black uppercase shadow-[1px_1px_0px_0px_#000] hover:translate-x-[0.5px] hover:translate-y-[0.5px] hover:shadow-[0.5px_0.5px_0px_0px_#000] cursor-pointer"
											>
												Hapus
											</button>
										{/if}
									</div>

									<div class="flex flex-col gap-2">
										<label for="task-text-{index}" class="font-extrabold text-xs uppercase tracking-wide">
											Deskripsi Pekerjaan
											<span class="text-gray-400 font-normal text-[10px] normal-case ml-1">(Bisa copas git log untuk auto-split)</span>
										</label>
										<textarea
											id="task-text-{index}"
											bind:value={task.text}
											onpaste={(e) => handlePaste(e, index)}
											required
											placeholder="Tuliskan detail pekerjaan..."
											rows="2"
											class="w-full bg-white border-2 border-black p-3 font-semibold text-xs outline-none focus:border-brand-yellow placeholder:text-gray-400"
										></textarea>
									</div>

									<div class="flex flex-col gap-2">
										<span class="font-extrabold text-xs uppercase tracking-wide">Status Task</span>
										<div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
											{#each Object.entries(statusConfig) as [key, config]}
												<label
													class="flex items-center justify-center gap-1.5 p-2 cursor-pointer border-2 border-black text-[10px] font-extrabold select-none transition-all duration-100
													{task.status === key
														? `${config.bg} translate-x-[1px] translate-y-[1px] shadow-[1px_1px_0px_0px_#000]`
														: 'bg-white shadow-[2px_2px_0px_0px_#000] hover:-translate-x-[0.5px] hover:-translate-y-[0.5px] hover:shadow-[2.5px_2.5px_0px_0px_#000]'}"
												>
													<input
														type="radio"
														name="status-{index}"
														value={key}
														bind:group={task.status}
														class="sr-only"
														required
													/>
													<span>{config.emoji}</span>
													<span>{config.text}</span>
												</label>
											{/each}
										</div>
									</div>
								</div>
							{/each}
						</div>

						<!-- Submit Button -->
						<div class="pt-2">
							<button
								type="submit"
								disabled={submitting}
								class="w-full neo-btn bg-brand-yellow p-4 font-black text-sm tracking-widest uppercase cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
							>
								{#if submitting}
									Menyimpan Laporan...
								{:else}
									Kirim Laporan Harian 🚀
								{/if}
							</button>
						</div>
					</form>
				</div>
			</section>

			<!-- SUBMISSIONS BOARD COLUMN -->
			<section class="lg:col-span-7 flex flex-col gap-6">
				<div class="bg-white border-4 border-black p-6 neo-shadow h-full flex flex-col">
					<h2
						class="text-xl font-black uppercase border-b-3 border-black pb-3 mb-5 flex items-center justify-between"
					>
						<span>📋 Status & Laporan Karyawan</span>
						<span
							class="text-[10px] font-black bg-brand-yellow px-2 py-0.5 border-2 border-black neo-shadow-sm"
							>LIVE UPDATING</span
						>
					</h2>

					<div class="flex flex-col gap-4 overflow-y-auto max-h-[600px] pr-1 flex-grow">
						{#each data.employees as employee}
							{@const report = data.submissions[employee]}
							{#if report}
								<!-- Submitted Employee Card -->
								<div
									class="bg-white border-3 border-black p-4 neo-shadow flex flex-col gap-3 relative transition-all hover:scale-[1.01]"
								>
									<!-- Neo decoration -->
									<div class="absolute top-0 right-0 w-4 h-4 border-l-3 border-b-3 border-black bg-black"></div>

									<div
										class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b-2 border-black/10 pb-2"
									>
										<span class="font-extrabold text-base tracking-wide uppercase flex items-center gap-2">
											👤 {employee}
										</span>
									</div>

									<div class="flex flex-col gap-3 pl-1">
										{#each report.tasks || [] as item}
											{@const config = statusConfig[item.status] || statusConfig['Done']}
											<div class="flex items-start gap-2 text-sm font-semibold text-black/90 leading-relaxed">
												<span
													class="inline-flex items-center gap-1.5 px-2 py-0.5 font-bold text-[10px] uppercase border-2 border-black {config.bg} shadow-[1.5px_1.5px_0px_0px_#000] shrink-0 mt-0.5"
												>
													<span>{config.emoji}</span>
													<span>{config.text}</span>
												</span>
												<span class="whitespace-pre-wrap">{item.text}</span>
											</div>
										{/each}
									</div>

									<div
										class="flex justify-end text-[9px] font-bold text-gray-400 uppercase tracking-wider border-t border-black/5 pt-2"
									>
										Laporan masuk: {new Date(report.submittedAt).toLocaleTimeString('id-ID', {
											hour: '2-digit',
											minute: '2-digit'
										})} WIB
									</div>
								</div>
							{:else}
								<!-- Not Submitted Skeleton -->
								<div
									class="border-3 border-dashed border-gray-300 bg-gray-50/50 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-gray-500"
								>
									<span class="font-bold text-sm tracking-wide uppercase flex items-center gap-2">
										<span class="opacity-50">👤</span> {employee}
									</span>
									<span
										class="inline-flex items-center gap-1 px-3 py-1 font-bold text-[10px] uppercase tracking-wider border-2 border-dashed border-gray-300 bg-white"
									>
										❌ Belum Mengisi Laporan
									</span>
								</div>
							{/if}
						{/each}
					</div>
				</div>
			</section>
		</div>

		<!-- FOOTER -->
		<footer
			class="text-center font-bold text-xs md:text-sm uppercase tracking-wider py-8 flex flex-col gap-2"
		>
			<div>TASKLS APP • NEO-BRUTALISM EDITION</div>
			<div class="text-gray-400">Data otomatis direset setiap hari baru</div>
		</footer>
	</div>
</main>

<style>
	/* Custom thin scrollbar for employees list board */
	::-webkit-scrollbar {
		width: 6px;
	}
	::-webkit-scrollbar-track {
		background: transparent;
	}
	::-webkit-scrollbar-thumb {
		background: #000;
		border: 1px solid #fff;
	}
</style>
