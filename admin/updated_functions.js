// This file contains the updated loadLogs and loadMore functions
// Copy this into admin/index.html replacing the existing loadLogs function

window.loadLogs = async function () {
    const status = $("status");
    const tbody = $("logBody");
    const mobileBody = $("logBodyMobile");
    const loadMoreBtn = $("loadMore Btn");

    if (!GOOGLE_SCRIPT_URL || GOOGLE_SCRIPT_URL.includes("YOUR_")) {
        $("configWarning").style.display = "block";
        status.innerHTML = `<span style="color:var(--danger)">Configuration Missing</span>`;
        return;
    }

    status.innerHTML = `Loading from Google Sheets... <span class="spinner"></span>`;
    if (loadMoreBtn) loadMoreBtn.style.display = 'none';

    await loadNicknamesFromSheets();

    try {
        const res = await fetch(GOOGLE_SCRIPT_URL);
        if (!res.ok) throw new Error("Failed to fetch");

        allLogs = await res.json();
        displayedCount = 0;

        if (allLogs.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:20px; color:var(--muted)">No logs found yet.</td></tr>`;
            mobileBody.innerHTML = `<div style="text-align:center; padding:20px; color:var(--muted)">No logs found yet.</div>`;
            status.textContent = `No logs found.`;
        } else {
            // Load first batch
            const initialCount = Math.min(LOGS_PER_PAGE, allLogs.length);
            renderLogs(0, initialCount, true);
            displayedCount = initialCount;

            // Show Load More button if there are more logs
            if (displayedCount < allLogs.length && loadMoreBtn) {
                loadMoreBtn.style.display = 'block';
                const remaining = allLogs.length - displayedCount;
                loadMoreBtn.textContent = `Load More (${Math.min(LOGS_PER_PAGE, remaining)} of ${remaining} remaining)`;
            }

            status.textContent = `Loaded ${displayedCount} of ${allLogs.length} logs.`;
        }
    } catch (err) {
        status.innerHTML = `<span style="color:var(--danger)">Error: ${err.message}</span>. Check console & CORS settings.`;
    }
};

window.loadMore = function () {
    const status = $("status");
    const loadMoreBtn = $("loadMoreBtn");

    const nextCount = Math.min(displayedCount + LOGS_PER_PAGE, allLogs.length);
    renderLogs(displayedCount, nextCount, false);
    displayedCount = nextCount;

    if (displayedCount >= allLogs.length) {
        if (loadMoreBtn) loadMoreBtn.style.display = 'none';
    } else if (loadMoreBtn) {
        const remaining = allLogs.length - displayedCount;
        loadMoreBtn.textContent = `Load More (${Math.min(LOGS_PER_PAGE, remaining)} of ${remaining} remaining)`;
    }

    status.textContent = `Loaded ${displayedCount} of ${allLogs.length} logs.`;
};

function renderLogs(start, end, clearFirst) {
    const tbody = $("logBody");
    const mobileBody = $("logBodyMobile");
    const logsToRender = allLogs.slice(start, end);

    if (logsToRender.length === 0) return;

    const desktopHTML = logsToRender.map(l => {
        let timeStr = l.timestamp;
        try { timeStr = new Date(l.timestamp).toLocaleString(); } catch (e) { }

        let mapLink = "—";
        if (l.location) {
            mapLink = `<a href="https://www.google.com/maps?q=${l.location}" target="_blank" style="color:var(--accent)">View</a>`;
        }

        const deviceId = l.user || "Unknown";
        const displayName = getDisplayName(deviceId);
        const isNicknamed = displayName !== deviceId;

        return `
        <tr>
            <td>${escape(timeStr)}</td>
            <td>
                <div style="display:flex; align-items:center; gap:8px;">
                    <span class="pill" style="display:inline-flex; border:none; background:${isNicknamed ? 'rgba(124, 159, 255, 0.15)' : 'rgba(255,255,255,0.05)'}; font-size:13px; padding:4px 10px;" title="Device ID: ${escape(deviceId)}">${escape(displayName)}</span>
                    <button class="edit-nickname-btn" data-device-id="${escape(deviceId)}" style="font-size:9px; padding:2px 4px; background:transparent; border:1px solid var(--accent); color:var(--accent); cursor:pointer; border-radius:3px;" title="Edit nickname">✏️</button>
                </div>
            </td>
            <td style="color:var(--accent)">${escape(l.query)}</td>
            <td><span class="copy-route" data-route="${escape(l.topResultSummary)}" style="cursor:pointer; text-decoration:underline; text-decoration-style:dotted;" title="Click to copy">${escape(l.topResultSummary)}</span></td>
            <td>${escape(l.intersection)}</td>
            <td>${mapLink}</td>
        </tr>
    `}).join("");

    const mobileHTML = logsToRender.map(l => {
        let timeStr = l.timestamp;
        try { timeStr = new Date(l.timestamp).toLocaleString(); } catch (e) { }

        const deviceId = l.user || "Unknown";
        const displayName = getDisplayName(deviceId);
        const isNicknamed = displayName !== deviceId;

        let mapLink = "—";
        if (l.location) {
            mapLink = `<a href="https://www.google.com/maps?q=${l.location}" target="_blank" style="color:var(--accent)">View Map</a>`;
        }

        return `
        <div class="log-card">
            <div class="log-card-row">
                <span class="log-card-label">Time</span>
                <span class="log-card-value">${escape(timeStr)}</span>
            </div>
            <div class="log-card-row">
                <span class="log-card-label">User</span>
                <div class="log-card-value" style="display:flex; align-items:center; justify-content:flex-end; gap:8px;">
                    <span class="pill" style="display:inline-flex; border:none; background:${isNicknamed ? 'rgba(124, 159, 255, 0.15)' : 'rgba(255,255,255,0.05)'}; font-size:18px; padding:6px 12px; font-weight:500; flex-grow:1; justify-content:center;" title="Device ID: ${escape(deviceId)}">${escape(displayName)}</span>
                    <button class="edit-nickname-btn-mobile" data-device-id="${escape(deviceId)}" style="font-size:8px; padding:3px 5px; background:transparent; border:1px solid rgba(124, 159, 255, 0.5); color:var(--accent); cursor:pointer; border-radius:3px; flex-shrink:0; width:28px;" title="Edit nickname">✏️</button>
                </div>
            </div>
            <div class="log-card-row">
                <span class="log-card-label">Query</span>
                <span class="log-card-value" style="color:var(--accent)">${escape(l.query)}</span>
            </div>
            <div class="log-card-row">
                <span class="log-card-label">Result</span>
                <span class="log-card-value"><span class="copy-route" data-route="${escape(l.topResultSummary)}" style="cursor:pointer; text-decoration:underline; text-decoration-style:dotted;" title="Click to copy">${escape(l.topResultSummary)}</span></span>
           </div>
            <div class="log-card-row">
                <span class="log-card-label">Location</span>
                <span class="log-card-value">${escape(l.intersection)}</span>
            </div>
            <div class="log-card-row">
                <span class="log-card-label">Map</span>
                <span class="log-card-value">${mapLink}</span>
            </div>
        </div>
    `}).join("");

    if (clearFirst) {
        tbody.innerHTML = desktopHTML;
        mobileBody.innerHTML = mobileHTML;
    } else {
        tbody.innerHTML += desktopHTML;
        mobileBody.innerHTML += mobileHTML;
    }

    // Add click events for route copying
    document.querySelectorAll('.copy-route').forEach(el => {
        el.addEventListener('click', async function () {
            const route = this.getAttribute('data-route');
            const success = await copyToClipboard(route);
            if (success) {
                const originalText = this.textContent;
                this.textContent = '✓ Copied!';
                this.style.color = 'var(--success)';
                setTimeout(() => {
                    this.textContent = originalText;
                    this.style.color = '';
                }, 1500);
            }
        });
    });

    // Add edit nickname listeners
    document.querySelectorAll('.edit-nickname-btn, .edit-nickname-btn-mobile').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const deviceId = btn.getAttribute('data-device-id');
            const currentNickname = getDisplayName(deviceId);
            const prompt_text = deviceId === currentNickname
                ? `Enter a nickname for device "${deviceId}":`
                : `Edit nickname for device "${deviceId}"\nCurrent: "${currentNickname}"`;

            const newNickname = prompt(prompt_text, deviceId === currentNickname ? "" : currentNickname);

            if (newNickname !== null) {
                const status = $("status");
                status.innerHTML = `Saving... <span class="spinner"></span>`;
                await saveNicknameToSheets(deviceId, newNickname);
                status.innerHTML = `<span style="color:var(--success)">Nickname saved!</span>`;
                setTimeout(() => loadLogs(), 500);
            }
        });
    });
}
