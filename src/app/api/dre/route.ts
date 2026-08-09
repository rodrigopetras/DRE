import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

async function verifyAccess(userId: string, companyId: string) {
  const company = await db.company.findUnique({ where: { id: companyId } })
  if (!company) return false
  if (company.userId === userId) return true
  const share = await db.companyShare.findUnique({
    where: { companyId_userId: { companyId, userId } },
  })
  return share?.status === 'accepted'
}

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const userId = (session.user as any).id
    const { searchParams } = new URL(req.url)
    const companyId = searchParams.get('companyId')
    const month = searchParams.get('month')
    const year = searchParams.get('year')
    const all = searchParams.get('all')

    if (companyId) {
      const hasAccess = await verifyAccess(userId, companyId)
      if (!hasAccess) {
        return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
      }
    }

    if (all === 'true' && companyId) {
      // Get all entries for a company (for charts/history)
      const entries = await db.dREEntry.findMany({
        where: { companyId },
        orderBy: [{ year: 'asc' }, { month: 'asc' }],
      })
      return NextResponse.json(entries)
    }

    if (!companyId || !month || !year) {
      return NextResponse.json({ error: 'Parâmetros incompletos' }, { status: 400 })
    }

    const entry = await db.dREEntry.findUnique({
      where: {
        companyId_month_year: {
          companyId,
          month: parseInt(month),
          year: parseInt(year),
        },
      },
    })

    return NextResponse.json(entry)
  } catch (error) {
    return NextResponse.json({ error: 'Erro ao buscar DRE' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const userId = (session.user as any).id
    const body = await req.json()
    const { companyId, month, year, ...data } = body

    if (!companyId || !month || !year) {
      return NextResponse.json({ error: 'Parâmetros incompletos' }, { status: 400 })
    }

    // Verify access
    const hasAccess = await verifyAccess(userId, companyId)
    if (!hasAccess) {
      return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
    }

    const entry = await db.dREEntry.upsert({
      where: {
        companyId_month_year: {
          companyId,
          month: parseInt(month),
          year: parseInt(year),
        },
      },
      update: data,
      create: {
        companyId,
        month: parseInt(month),
        year: parseInt(year),
        ...data,
      },
    })

    return NextResponse.json(entry)
  } catch (error) {
    return NextResponse.json({ error: 'Erro ao salvar DRE' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const userId = (session.user as any).id
    const { searchParams } = new URL(req.url)
    const companyId = searchParams.get('companyId')
    const month = searchParams.get('month')
    const year = searchParams.get('year')

    if (!companyId || !month || !year) {
      return NextResponse.json({ error: 'Parâmetros incompletos' }, { status: 400 })
    }

    // Verify access
    const hasAccess = await verifyAccess(userId, companyId)
    if (!hasAccess) {
      return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
    }

    await db.dREEntry.delete({
      where: {
        companyId_month_year: {
          companyId,
          month: parseInt(month),
          year: parseInt(year),
        },
      },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: 'Erro ao excluir DRE' }, { status: 500 })
  }
}
