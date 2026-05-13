const ALLOWED_DIFFS = new Set(["daily"]);
const MAX_DAYS = 30;
const TOP_N = 50;

const CORS: Record<string, string> = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Methods": "GET, POST, OPTIONS",
	"Access-Control-Allow-Headers": "Content-Type",
};

function json(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json", ...CORS },
	});
}

function err(message: string, status = 400): Response {
	return json({ error: message }, status);
}

// Daily challenge rolls over at midnight Japan Standard Time (UTC+9, no DST).
const DAILY_TZ = "Asia/Tokyo";
const DAILY_KEY_FMT = new Intl.DateTimeFormat("en-CA", {
	timeZone: DAILY_TZ,
	year: "numeric",
	month: "2-digit",
	day: "2-digit",
});

function todayJST(): string {
	return DAILY_KEY_FMT.format(new Date());
}

function dateKeyNDaysAgo(n: number): string {
	return DAILY_KEY_FMT.format(new Date(Date.now() - n * 86400000));
}

type Submission = {
	dateKey: string;
	diff: string;
	name: string;
	score: number;
	wordCount: number;
};

function validSubmission(body: unknown): { ok: true; value: Submission } | { ok: false; error: string } {
	if (!body || typeof body !== "object") return { ok: false, error: "invalid body" };
	const b = body as Record<string, unknown>;
	const dateKey = b.dateKey;
	const diff = b.diff;
	const name = b.name;
	const score = b.score;
	const wordCount = b.wordCount;
	if (typeof dateKey !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return { ok: false, error: "bad dateKey" };
	const today = todayJST();
	const cutoff = dateKeyNDaysAgo(MAX_DAYS);
	if (dateKey > today) return { ok: false, error: "dateKey in future" };
	if (dateKey < cutoff) return { ok: false, error: "dateKey too old" };
	if (typeof diff !== "string" || !ALLOWED_DIFFS.has(diff)) return { ok: false, error: "bad diff" };
	if (typeof name !== "string") return { ok: false, error: "bad name" };
	const upper = name.trim().toUpperCase();
	if (!/^[A-Z]{1,6}$/.test(upper)) return { ok: false, error: "name must be 1-6 letters" };
	if (!Number.isInteger(score) || (score as number) < 0 || (score as number) > 10000) return { ok: false, error: "bad score" };
	if (!Number.isInteger(wordCount) || (wordCount as number) < 0 || (wordCount as number) > 500) return { ok: false, error: "bad wordCount" };
	return { ok: true, value: { dateKey, diff, name: upper, score: score as number, wordCount: wordCount as number } };
}

type Row = { date_key: string; diff: string; name: string; score: number; words: number; ts: number };

async function handleGetAll(env: Env): Promise<Response> {
	const cutoff = dateKeyNDaysAgo(MAX_DAYS);
	const { results } = await env.DB.prepare(
		`SELECT date_key, diff, name, score, words, ts
		 FROM entries
		 WHERE date_key >= ?1
		 ORDER BY date_key DESC, diff ASC, score DESC, ts ASC`
	)
		.bind(cutoff)
		.all<Row>();

	const out: Record<string, Array<{ n: string; s: number; w: number; t: number }>> = {};
	const counts: Record<string, number> = {};
	for (const row of results) {
		const key = `${row.date_key}_${row.diff}`;
		if ((counts[key] || 0) >= TOP_N) continue;
		if (!out[key]) out[key] = [];
		out[key].push({ n: row.name, s: row.score, w: row.words, t: row.ts });
		counts[key] = (counts[key] || 0) + 1;
	}
	return json(out);
}

async function handleSubmit(request: Request, env: Env): Promise<Response> {
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return err("invalid json");
	}
	const v = validSubmission(body);
	if (!v.ok) return err(v.error);

	const { dateKey, diff, name, score, wordCount } = v.value;
	const ts = Date.now();

	await env.DB.prepare(
		`INSERT INTO entries (date_key, diff, name, score, words, ts)
		 VALUES (?1, ?2, ?3, ?4, ?5, ?6)
		 ON CONFLICT(date_key, diff, name) DO UPDATE SET
		   score = CASE WHEN excluded.score > entries.score THEN excluded.score ELSE entries.score END,
		   words = CASE WHEN excluded.score > entries.score THEN excluded.words ELSE entries.words END,
		   ts    = CASE WHEN excluded.score > entries.score THEN excluded.ts    ELSE entries.ts    END`
	)
		.bind(dateKey, diff, name, score, wordCount, ts)
		.run();

	const cutoff = dateKeyNDaysAgo(MAX_DAYS);
	await env.DB.prepare(`DELETE FROM entries WHERE date_key < ?1`).bind(cutoff).run();

	const { results } = await env.DB.prepare(
		`SELECT name, score, words, ts FROM entries
		 WHERE date_key = ?1 AND diff = ?2
		 ORDER BY score DESC, ts ASC
		 LIMIT ?3`
	)
		.bind(dateKey, diff, TOP_N)
		.all<{ name: string; score: number; words: number; ts: number }>();

	return json(results.map((r) => ({ n: r.name, s: r.score, w: r.words, t: r.ts })));
}

export default {
	async fetch(request, env): Promise<Response> {
		if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

		const url = new URL(request.url);
		const path = url.pathname.replace(/\/+$/, "") || "/";

		if (request.method === "GET" && path === "/lb") return handleGetAll(env);
		if (request.method === "POST" && path === "/lb/submit") return handleSubmit(request, env);
		if (request.method === "GET" && path === "/") return json({ ok: true, service: "d1-gridword" });

		return err("not found", 404);
	},
} satisfies ExportedHandler<Env>;
