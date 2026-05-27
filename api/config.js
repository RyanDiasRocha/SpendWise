// Vercel Serverless Function para expor as credenciais públicas do Supabase do arquivo .env
export default function handler(req, res) {
    // Definir cabeçalho CORS e Cache Control se necessário
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET');
    res.setHeader('Content-Type', 'application/json');

    res.status(200).json({
        supabaseUrl: process.env.SUPABASE_URL || "",
        supabaseAnonKey: process.env.SUPABASE_ANON_KEY || ""
    });
}
