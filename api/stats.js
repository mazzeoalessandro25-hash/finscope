export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=60');

  const SECRET = process.env.CLERK_SECRET_KEY;
  if (!SECRET) return res.json({ count: 0 });

  try {
    const r = await fetch('https://api.clerk.com/v1/users/count', {
      headers: { Authorization: `Bearer ${SECRET}` }
    });
    const d = await r.json();
    return res.json({ count: d.total_count ?? 0 });
  } catch {
    return res.json({ count: 0 });
  }
}
