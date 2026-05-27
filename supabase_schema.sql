-- 1. Habilitar extensão UUID se necessário
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Tabela de Períodos
CREATE TABLE IF NOT EXISTS public.periods (
    id TEXT PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Habilitar RLS (Row Level Security) na tabela de períodos
ALTER TABLE public.periods ENABLE ROW LEVEL SECURITY;

-- Criar políticas de segurança para períodos
CREATE POLICY "Usuários podem gerenciar seus próprios períodos" 
    ON public.periods 
    FOR ALL 
    TO authenticated 
    USING (auth.uid() = user_id) 
    WITH CHECK (auth.uid() = user_id);

-- 3. Tabela de Despesas
CREATE TABLE IF NOT EXISTS public.expenses (
    id TEXT PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    period_id TEXT REFERENCES public.periods(id) ON DELETE CASCADE NOT NULL,
    description TEXT NOT NULL,
    value NUMERIC(12, 2) NOT NULL,
    date DATE NOT NULL,
    payment_method TEXT NOT NULL,
    reserved BOOLEAN DEFAULT FALSE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Habilitar RLS na tabela de despesas
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

-- Criar políticas de segurança para despesas
CREATE POLICY "Usuários podem gerenciar suas próprias despesas" 
    ON public.expenses 
    FOR ALL 
    TO authenticated 
    USING (auth.uid() = user_id) 
    WITH CHECK (auth.uid() = user_id);

-- 4. Tabela de Formas de Pagamento Customizadas
CREATE TABLE IF NOT EXISTS public.payment_methods (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE (user_id, name)
);

-- Habilitar RLS na tabela de formas de pagamento
ALTER TABLE public.payment_methods ENABLE ROW LEVEL SECURITY;

-- Criar políticas de segurança para formas de pagamento
CREATE POLICY "Usuários podem gerenciar suas formas de pagamento" 
    ON public.payment_methods 
    FOR ALL 
    TO authenticated 
    USING (auth.uid() = user_id) 
    WITH CHECK (auth.uid() = user_id);
