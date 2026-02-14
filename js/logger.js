import { GOOGLE_SCRIPT_URL } from './config.js';

function getClientId() {
    let id = localStorage.getItem('dashboard_client_id');
    if (!id) {
        // Generate a unique device ID with timestamp for uniqueness
        id = 'device-' + Math.random().toString(36).substr(2, 9) + Date.now().toString(36).substr(-4);
        localStorage.setItem('dashboard_client_id', id);
    }
    return id;
}

export async function logSearch(query, details = {}) {
    if (!GOOGLE_SCRIPT_URL || GOOGLE_SCRIPT_URL.includes("YOUR_")) {
        console.warn("Google Script URL not set");
        return;
    }

    const topResult = details.topResult;
    const params = new URLSearchParams({
        user: getClientId(),
        query: query,
        topResultSummary: topResult ? `${topResult.Route} (${topResult.YARD})` : "No Match",
        intersection: details.intersection || (topResult ? topResult.STREETSORT : ""),
        location: details.location ? `${details.location.lat},${details.location.lon}` : "",
        sixCar: topResult ? (topResult["6 car"] || "") : ""
    });

    const fullUrl = `${GOOGLE_SCRIPT_URL}?${params.toString()}`;

    // Strategy 1: Fetch with keepalive (modern standard for logging)
    // This tells the browser "don't kill this request even if the user closes the tab/switches apps"
    try {
        fetch(fullUrl, { mode: 'no-cors', keepalive: true }).catch(() => { });
    } catch (e) {
        // Strategy 2: Image Beacon (Fallback)
        // We append it to the body to ensure mobile browsers don't garbage collect it too early
        const img = new Image();
        img.src = fullUrl;
        img.style.display = 'none';
        document.body.appendChild(img);
        // Clean up after a while
        setTimeout(() => img.remove(), 5000);
    }

    console.log("Logged:", query);
}
