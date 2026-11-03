// Tom Hire Video Library - Supabase Connected App

var SUPABASE_URL = "https://dltvqgejdntigbmyhqfr.supabase.co";
var SUPABASE_ANON_KEY = "sb_publishable_dyJQtPSVdfLiUN9GTjmZqQ_akWa1G4c";

window.SUPABASE_URL = SUPABASE_URL;
window.SUPABASE_ANON_KEY = SUPABASE_ANON_KEY;

const AUTH_STORAGE_KEY = "tom_library_session";

// ---------- Common API helper ----------

async function supabaseRequest(path, options = {}, authenticated = false) {
    const headers = {
        "apikey": SUPABASE_ANON_KEY,
        "Content-Type": "application/json",
        ...(options.headers || {})
    };

    if (authenticated) {
        const session = await getValidSession();

        if (!session || !session.access_token) {
            throw new Error("Admin login required. Please login again.");
        }

        headers["Authorization"] = "Bearer " + session.access_token;
    } else {
        headers["Authorization"] = "Bearer " + SUPABASE_ANON_KEY;
    }

    const response = await fetch(SUPABASE_URL + path, {
        ...options,
        headers
    });

    if (!response.ok) {
        const message = await response.text();
        throw new Error(message || "Supabase request failed.");
    }

    if (response.status === 204) return null;

    return response.json();
}

// ---------- Admin Authentication ----------

function getStoredSession() {
    try {
        return JSON.parse(sessionStorage.getItem(AUTH_STORAGE_KEY));
    } catch {
        return null;
    }
}

async function getValidSession() {
    let session = getStoredSession();

    if (!session) return null;

    // Refresh the login session when it is close to expiring.
    if (session.expires_at && Date.now() / 1000 > session.expires_at - 60) {
        if (!session.refresh_token) {
            logoutAdmin();
            return null;
        }

        try {
            const response = await fetch(
                SUPABASE_URL + "/auth/v1/token?grant_type=refresh_token",
                {
                    method: "POST",
                    headers: {
                        "apikey": SUPABASE_ANON_KEY,
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        refresh_token: session.refresh_token
                    })
                }
            );

            if (!response.ok) {
                logoutAdmin();
                return null;
            }

            const updated = await response.json();

            session = {
                ...updated,
                expires_at: Math.floor(Date.now() / 1000) + updated.expires_in
            };

            sessionStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
        } catch (error) {
            console.error("Session refresh failed:", error);
            return null;
        }
    }

    return session;
}

async function loginAdmin(email, password) {
    const response = await fetch(
        SUPABASE_URL + "/auth/v1/token?grant_type=password",
        {
            method: "POST",
            headers: {
                "apikey": SUPABASE_ANON_KEY,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ email, password })
        }
    );

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.msg || data.message || data.error_description || "Login failed. Check email and password.");
    }

    data.expires_at = Math.floor(Date.now() / 1000) + data.expires_in;

    sessionStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(data));

    return data;
}

async function isAdminLoggedIn() {
    const session = await getValidSession();
    return !!(session && session.access_token);
}

async function logoutAdmin() {
    const session = getStoredSession();

    if (session && session.access_token) {
        try {
            await fetch(SUPABASE_URL + "/auth/v1/logout", {
                method: "POST",
                headers: {
                    "apikey": SUPABASE_ANON_KEY,
                    "Authorization": "Bearer " + session.access_token
                }
            });
        } catch (error) {
            console.error("Logout request failed:", error);
        }
    }

    sessionStorage.removeItem(AUTH_STORAGE_KEY);
}

// ---------- Public Video List ----------

async function getVideos() {
    try {
        const data = await supabaseRequest(
            "/rest/v1/videos?select=*&order=publish_date.desc"
        );

        return Array.isArray(data) ? data : [];
    } catch (error) {
        console.error("Could not load videos:", error);
        throw error;
    }
}

// ---------- Add / Edit Video ----------

async function saveVideo(videoData, videoId = null) {
    const path = videoId
        ? "/rest/v1/videos?id=eq." + encodeURIComponent(videoId)
        : "/rest/v1/videos";

    const method = videoId ? "PATCH" : "POST";

    return supabaseRequest(
        path,
        {
            method,
            headers: {
                "Prefer": "return=representation"
            },
            body: JSON.stringify(videoData)
        },
        true
    );
}

// ---------- Delete Video ----------

async function deleteVideoRecord(videoId) {
    return supabaseRequest(
        "/rest/v1/videos?id=eq." + encodeURIComponent(videoId),
        {
            method: "DELETE"
        },
        true
    );
}

// ---------- Share Video ----------

async function handleShare(title, url) {
    const shareData = {
        title: title,
        text: 'Watch "' + title + '" on Tom Hire Video Library',
        url: url
    };

    if (navigator.share) {
        try {
            await navigator.share(shareData);
            return;
        } catch (error) {
            if (error.name === "AbortError") return;
        }
    }

    const whatsappUrl =
        "https://api.whatsapp.com/send?text=" +
        encodeURIComponent(shareData.text + " - " + url);

    if (confirm("OK = Share on WhatsApp\nCancel = Copy video link")) {
        window.open(whatsappUrl, "_blank");
    } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(url);
        alert("Video link copied!");
    } else {
        prompt("Copy this video link:", url);
    }
}