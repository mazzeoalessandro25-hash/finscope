export default async function handler(req, res) {
  res.setHeader('Cache-Control','public,s-maxage=120,stale-while-revalidate=60');
  const {action,id,days}=req.query;
  try {
    if(action==='chart'&&id){
      const d=parseInt(days)||30;
      const url=d==='max'
        ?`https://api.coingecko.com/api/v3/coins/${encodeURIComponent(id)}/market_chart?vs_currency=usd&days=max`
        :`https://api.coingecko.com/api/v3/coins/${encodeURIComponent(id)}/market_chart?vs_currency=usd&days=${d}&interval=daily`;
      const r=await fetch(url,{headers:{'User-Agent':'FinEdge/1.0'}});
      if(!r.ok) return res.status(502).json({error:'chart error '+r.status});
      return res.json(await r.json());
    }
    const [mR,gR,fR]=await Promise.all([
      fetch('https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=50&page=1&sparkline=false&price_change_percentage=7d%2C30d%2C1y',{headers:{'User-Agent':'FinEdge/1.0'}}),
      fetch('https://api.coingecko.com/api/v3/global',{headers:{'User-Agent':'FinEdge/1.0'}}),
      fetch('https://api.alternative.me/fng/')
    ]);
    if(!mR.ok) return res.status(502).json({error:'markets error '+mR.status});
    const [coins,global,fng]=await Promise.all([
      mR.json(),
      gR.ok?gR.json():null,
      fR.ok?fR.json():null
    ]);
    return res.json({coins,global:global?.data||null,fng:fng?.data?.[0]||null});
  }catch(e){
    return res.status(500).json({error:e.message});
  }
}
