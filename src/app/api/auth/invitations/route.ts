import { db } from '@/lib/db'
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }
    const userId = (session.user as any).id as string
    const invitations = await db.companyShare.findMany({
      where: { userId, status: 'pending' },
      include: {
        company: { select: { id: true, name: true } },
        inviter: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    })
    return NextResponse.json(invitations)
  } catch (error) {
    return NextResponse.json({ error: 'Erro ao buscar convites' }, { status: 500 })
  }
}
