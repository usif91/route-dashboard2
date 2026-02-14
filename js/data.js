import { normalizeForTokens, formatRoute, formatVal } from './utils.js';

export const state = {
    synonyms: [],

    DATA: [],
    query: "",
    matches: [],
    shown: 0,
    pageSize: 200,

    nearMode: false,
    nearSorted: [],
    nearIndex: 0,
    nearPageSize: 5,

    userPos: null,
    expandedRoutes: new Set(),
    synonyms: new Map(),

    // Synonyms from Sheet3 (optional)
    SYN_TOKEN: new Map(), // token -> Set(tokens)
    SYN_GROUPS: []        // [{phrases:[...], tokens:Set([...])}]
};

export async function loadWorkbook(url, setStatusCallback, callback) {
    if (setStatusCallback) setStatusCallback("muted", `Loading ${url}… <span class="spinner"></span>`);
    try {
        const resp = await fetch(url, { cache: "no-store" });
        if (!resp.ok) throw new Error(`Fetch failed (${resp.status})`);
        const buf = await resp.arrayBuffer();
        // Access XLSX from global scope (loaded via script tag)
        const wb = window.XLSX.read(buf, { type: "array" });

        processWorkbook(wb);

        if (setStatusCallback) setStatusCallback("ok", `Loaded ${state.DATA.length.toLocaleString()} rows.`);
        if (callback) callback();
    } catch (err) {
        if (setStatusCallback) setStatusCallback("error", `Could not load ${url}. ${err.message}`);
        state.DATA = [];
        if (callback) callback();
    }
}

function processWorkbook(wb) {
    const s1name = wb.SheetNames[0];
    const s2name = wb.SheetNames[1];
    const s1 = wb.Sheets[s1name];
    const s2 = wb.Sheets[s2name];

    const sheet1 = window.XLSX.utils.sheet_to_json(s1, { defval: null });
    const sheet2 = window.XLSX.utils.sheet_to_json(s2, { defval: null });

    // Sheet3: alternatives/synonyms (optional)
    state.synonyms = new Map();
    state.SYN_TOKEN = new Map();
    state.SYN_GROUPS = [];

    if (wb.SheetNames.length >= 3) {
        const s3 = wb.Sheets[wb.SheetNames[2]];
        if (s3) {
            const sheet3 = window.XLSX.utils.sheet_to_json(s3, { defval: null });
            processSynonyms(sheet3);
        }
    }

    mergeSheets(sheet1, sheet2);
}

function processSynonyms(sheet3) {
    const addTokenSyn = (a, b) => {
        if (!a || !b) return;
        if (!state.SYN_TOKEN.has(a)) state.SYN_TOKEN.set(a, new Set([a]));
        if (!state.SYN_TOKEN.has(b)) state.SYN_TOKEN.set(b, new Set([b]));
        state.SYN_TOKEN.get(a).add(b);
        state.SYN_TOKEN.get(b).add(a);
    };

    for (const row of sheet3) {
        const phrases = Object.values(row)
            .map(v => v === null || v === undefined ? "" : String(v))
            .map(v => normalizeForTokens(v))
            .filter(v => v);

        if (phrases.length < 2) continue;
        const uniq = Array.from(new Set(phrases));

        // Simple single-token synonyms
        for (const term of uniq) {
            state.synonyms.set(term, uniq);
        }

        const tokSet = new Set();
        for (const ph of uniq) {
            for (const t of ph.split(" ").filter(Boolean)) {
                if (t !== "AND") tokSet.add(t);
            }
        }

        // Best-effort direct token pair if the row is exactly two single tokens
        if (uniq.length === 2) {
            const aT = uniq[0].split(" ").filter(Boolean);
            const bT = uniq[1].split(" ").filter(Boolean);
            if (aT.length === 1 && bT.length === 1) {
                addTokenSyn(aT[0], bT[0]);
            }
        }

        state.SYN_GROUPS.push({ phrases: uniq, tokens: tokSet });
    }
}

function mergeSheets(sheet1, sheet2) {
    const routeKey1 = sheet1.length ? (("Route" in sheet1[0]) ? "Route" : Object.keys(sheet1[0])[0]) : "Route";
    const routeKey2 = sheet2.length ? (("Route" in sheet2[0]) ? "Route" : Object.keys(sheet2[0])[0]) : "Route";

    const unnamed6 = sheet2.length ? Object.keys(sheet2[0]).find(k => k.toLowerCase().includes("unnamed") && k.includes("6")) : null;

    // Helper to fuzzy find key in row object
    const findKey = (row, digits) => Object.keys(row).find(k => {
        const s = String(k).trim().toLowerCase();
        return s === digits || s === `${digits}.0` || (s.includes(digits) && s.includes("car"));
    });

    const map2 = new Map();

    for (const r of sheet2) {
        const route = Number(r[routeKey2]);
        if (!Number.isFinite(route)) continue;
        const row = { ...r };
        row.Route = route;

        // Normalize the car keys
        row.__plans = {};
        for (const d of ["1", "2", "3", "4", "5", "6"]) {
            const k = findKey(r, d);
            if (k) row.__plans[`${d} car`] = r[k];
        }

        if (unnamed6 && !row.__plans["1 car"]) {
            row.__plans["1 car"] = row[unnamed6];
        }

        map2.set(route, row);
    }

    // Helper to find column case-insensitively
    const findCol = (row, name) => Object.keys(row).find(k => k.toLowerCase().includes(name.toLowerCase()));

    const yardKey = sheet1.length ? (("YARD" in sheet1[0]) ? "YARD" : findCol(sheet1[0], "yard")) : "YARD";
    const streetKey = sheet1.length ? (("STREETSORT" in sheet1[0]) ? "STREETSORT" : findCol(sheet1[0], "street")) : "STREETSORT";

    const merged = [];
    for (const r of sheet1) {
        const route = Number(r[routeKey1]);
        if (!Number.isFinite(route)) continue;

        const row1 = { ...r };
        row1.Route = route;

        const row2 = map2.get(route) || { __plans: {} };
        const plans = row2.__plans || {};

        const out = {
            Route: row1.Route,
            YARD: row1[yardKey] ?? null,
            STREETSORT: row1[streetKey] ?? null,
            coordinates: row1.coordinates ?? null,
            "6 car": plans["6 car"] ?? null,
            "5 car": plans["5 car"] ?? null,
            "4 car": plans["4 car"] ?? null,
            "3 car": plans["3 car"] ?? null,
            "2 car": plans["2 car"] ?? null,
            "1 car": plans["1 car"] ?? null,
        };

        const { lat, lon } = parseCoord(out.coordinates);
        out.lat = lat; out.lon = lon;

        merged.push(out);
    }
    state.DATA = merged;
}

function parseCoord(s) {
    if (s === null || s === undefined) return { lat: null, lon: null };
    const txt = String(s).trim().replace(/,+\s*$/, "");
    const parts = txt.split(",").map(x => x.trim()).filter(Boolean);
    if (parts.length < 2) return { lat: null, lon: null };
    const lat = Number(parts[0]);
    const lon = Number(parts[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return { lat: null, lon: null };
    return { lat, lon };
}

function buildHaystack(r) {
    const raw = (r.Route ?? "").toString();
    const digits = raw.replace(/\D/g, "");
    const padded = (digits || raw).toString().padStart(5, "0");
    return normalizeForTokens(`${padded} ${digits || raw} ${r.YARD ?? ""} ${r.STREETSORT ?? ""}`);
}

function queryMode(q) {
    const norm = normalizeForTokens(q);
    if (!norm) return "all";
    const hasLetter = /[A-Z]/.test(norm);
    const hasDigit = /[0-9]/.test(norm);
    if (!hasLetter && hasDigit) return "numeric";
    return "alpha";
}

function haystackForMode(r, mode) {
    if (mode === "numeric") {
        const route = formatRoute(r.Route);
        return normalizeForTokens(`${route} ${r.STREETSORT ?? ""}`);
    }
    if (mode === "alpha") {
        return normalizeForTokens(`${r.STREETSORT ?? ""}`);
    }
    return buildHaystack(r);
}

function tokenizeQuery(q) {
    const qNorm = normalizeForTokens(q);
    return qNorm.split(" ").filter(Boolean).filter(t => t !== "AND");
}

function tokenMatch(query, haystack) {
    if (!query) return true;
    const tokens = tokenizeQuery(query);
    if (!tokens.length) return true;
    return tokens.every(t => {
        const alts = state.synonyms.get(t) || [t];
        return alts.some(a => haystack.includes(a));
    });
}

function haversineMiles(lat1, lon1, lat2, lon2) {
    const toRad = (d) => (d * Math.PI) / 180;
    const R = 3958.7613;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
        Math.sin(dLon / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}



function calculateScore(item, query, mode) {
    const haystack = haystackForMode(item, mode);
    const tokens = tokenizeQuery(query);
    let totalScore = 0;

    for (const token of tokens) {
        const alts = state.synonyms.get(token) || [token];
        let bestScoreForToken = -10000;

        // Find the best match among synonyms for this token
        let foundAny = false;
        for (const alt of alts) {
            // Find all occurrences of this token as a complete word
            const haystackTokens = haystack.split(' ');

            for (let i = 0; i < haystackTokens.length; i++) {
                const haystackToken = haystackTokens[i];

                // Check if the haystack token starts with the search token
                if (haystackToken.startsWith(alt)) {
                    foundAny = true;

                    // Calculate the character position in the original haystack
                    const charPos = haystackTokens.slice(0, i).join(' ').length + (i > 0 ? 1 : 0);

                    let score = 0;

                    // 1. Bonus for start of string
                    if (charPos === 0) score += 1000;
                    // 2. Bonus for word boundary (which all these are by definition)
                    else score += 500;

                    // 3. Bonus for exact match (not just prefix)
                    if (haystackToken === alt) score += 100;

                    // 4. Penalty for distance from start
                    score -= charPos;

                    if (score > bestScoreForToken) bestScoreForToken = score;
                }
            }
        }

        // If the token matches (it should, because we filtered), add to total
        if (foundAny) {
            totalScore += bestScoreForToken;
        }
    }
    return totalScore;
}


export function computeMatches() {
    state.nearMode = false;
    state.nearSorted = [];
    state.nearIndex = 0;

    const q = state.query;

    // User Requirement: Don't show results before adding at least 2 letters
    if (q.trim().length < 2) {
        state.matches = [];
        state.shown = 0;
        return;
    }

    const mode = queryMode(q);

    // 1. Filter
    const filtered = state.DATA.filter(r => tokenMatch(q, haystackForMode(r, mode)));

    // 2. Score and Sort
    // We map to an object to avoid recalculating scores repeatedly during sort
    const scored = filtered.map(r => ({
        data: r,
        score: calculateScore(r, q, mode)
    }));

    scored.sort((a, b) => b.score - a.score);

    state.matches = scored.map(s => s.data);
    state.shown = 0;
}

export function searchNearMe(setStatusCallback, renderCallback) {
    if (!navigator.geolocation) {
        setStatusCallback("error", "Geolocation not supported in this browser.");
        return;
    }
    setStatusCallback("muted", `Searching near you… <span class="spinner"></span>`);
    navigator.geolocation.getCurrentPosition(
        (pos) => {
            state.userPos = { lat: pos.coords.latitude, lon: pos.coords.longitude, accuracy: pos.coords.accuracy };

            const withDist = state.DATA
                .filter(r => typeof r.lat === "number" && typeof r.lon === "number")
                .map(r => ({ r, d: haversineMiles(state.userPos.lat, state.userPos.lon, r.lat, r.lon) }))
                .sort((a, b) => a.d - b.d);

            state.nearMode = true;
            state.nearSorted = withDist;
            state.nearIndex = 0;

            const lat = state.userPos.lat.toFixed(6);
            const lon = state.userPos.lon.toFixed(6);
            const acc = (state.userPos.accuracy ?? 0).toFixed(0);
            setStatusCallback("ok", `Captured your location: <b>${lat}, ${lon}</b> (±${acc} m).`);

            state.expandedRoutes.clear();
            renderCallback();
        },
        (err) => setStatusCallback("error", `Could not get your location: ${escapeHtml(err.message)}`),
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
    );
}
