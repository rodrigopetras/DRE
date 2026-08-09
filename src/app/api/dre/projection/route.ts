import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import ZAI from 'z-ai-web-dev-sdk'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { DRE_FIELDS, calcDREFromConfig } from '@/lib/dre-config'

async function verifyAccess(userId: string, companyId: string) {
  const company = await db.company.findUnique({ where: { id: companyId } })
  if (!company) return false
  if (company.userId === userId) return true
  const share = await db.companyShare.findUnique({
    where: { companyId_userId: { companyId, userId } },
  })
  return share?.status === 'accepted'
}

const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const userId = (session.user as any).id
    const body = await req.json()
    const { companyId, period, currentMonth, currentYear } = body

    if (!companyId || !period || !currentMonth || !currentYear) {
      return NextResponse.json({ error: 'Parâmetros incompletos' }, { status: 400 })
    }

    // Verify access
    const hasAccess = await verifyAccess(userId, companyId)
    if (!hasAccess) {
      return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
    }

    const monthsToProject = period === '3m' ? 3 : period === '6m' ? 6 : 12

    // Fetch historical data
    const entries = await db.dREEntry.findMany({
      where: { companyId },
      orderBy: [{ year: 'asc' }, { month: 'asc' }],
    })

    if (entries.length === 0) {
      return NextResponse.json(
        { error: 'Nenhum dado histórico disponível para projeção' },
        { status: 400 }
      )
    }

    // Prepare historical data for AI
    const historicalData = entries.map((e) => {
      const calc = calcDREFromConfig(e)
      const raw: Record<string, number> = {}
      for (const f of DRE_FIELDS) {
        raw[f.key] = (e as any)[f.key] || 0
      }
      return {
        month: e.month,
        year: e.year,
        label: `${MONTH_NAMES[e.month - 1]}/${e.year}`,
        ...calc,
        ...raw,
      }
    })

    const zai = await ZAI.create()

    // RNF-04: Build field list from config for AI prompt
    const fieldKeysStr = DRE_FIELDS.map(f => `"${f.key}": <número>`).join(', ')

    const prompt = `Você é um especialista em finanças e DRE (Demonstração do Resultado do Exercício) para escritórios de advocacia no Brasil.

Com base nos dados históricos abaixo, gere uma projeção orçamentária para os próximos ${monthsToProject} meses a partir de ${MONTH_NAMES[currentMonth - 1]}/${currentYear}.

DADOS HISTÓRICOS:
${JSON.stringify(historicalData, null, 2)}

Para cada mês projetado, retorne TODOS os campos do DRE como números. Os campos são:
${fieldKeysStr}

Regras:
1. Despesas fixas (aluguel, salarios, fgts, prolabore, bonus, inss, iptu, telefoneInternet, valeTransporte, planoSaude) tendem a ser estáveis
2. Receitas podem ter variações sazonais
3. Considere tendências de crescimento/declínio dos dados históricos
4. Valores devem ser realistas e consistentes com o histórico

Responda APENAS com um JSON válido no seguinte formato, sem nenhum texto adicional:
{"projections": [{"month": <numero>, "year": <ano>, '${fieldKeysStr}'}]}
`

    const completion = await zai.chat.completions.create({
      messages: [
        { role: 'assistant', content: 'Você é um analista financeiro especialista em DRE para escritórios de advocacia brasileiros. Responda apenas com JSON válido.' },
        { role: 'user', content: prompt },
      ],
      thinking: { type: 'disabled' },
    })

    const responseText = completion.choices[0]?.message?.content || ''

    // Parse JSON from response
    let jsonMatch = responseText.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return NextResponse.json({ error: 'Erro ao gerar projeção' }, { status: 500 })
    }

    const parsed = JSON.parse(jsonMatch[0])
    const projections = parsed.projections || []

    // Build projection data with all fields + calculated summary
    const projectionData = projections.map((p: Record<string, number>) => {
      const entry: Record<string, number> = { month: p.month, year: p.year }
      for (const f of DRE_FIELDS) {
        entry[f.key] = p[f.key] || 0
      }
      const calc = calcDREFromConfig(entry)
      return {
        ...entry,
        label: `${MONTH_NAMES[p.month - 1]}/${p.year}`,
        ...calc,
      }
    })

    // Historical data also with all fields
    const historical = historicalData.map((h) => ({
      month: h.month,
      year: h.year,
      label: h.label,
      receitaBruta: h.receitaBruta,
      receitaLiquida: h.receitaLiquida,
      despesasVariaveis: h.despesasVariaveis,
      despesasFixas: h.despesasFixas,
      resultadoLiquido: h.resultadoLiquido,
    }))

    return NextResponse.json({ historical, projections: projectionData })
  } catch (error) {
    console.error('Projection error:', error)
    return NextResponse.json({ error: 'Erro ao gerar projeção' }, { status: 500 })
  }
}
