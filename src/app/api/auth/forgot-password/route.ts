import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { email, newPassword } = body

    if (!email || !newPassword) {
      return NextResponse.json({ error: 'Email e nova senha são obrigatórios' }, { status: 400 })
    }

    if (newPassword.length < 6) {
      return NextResponse.json({ error: 'A senha deve ter pelo menos 6 caracteres' }, { status: 400 })
    }

    const user = await db.user.findUnique({ where: { email: email.trim().toLowerCase() } })

    // Always return success to avoid email enumeration attacks
    // But only actually change the password if user exists
    if (user && user.password) {
      const hashedPassword = await bcrypt.hash(newPassword, 10)
      await db.user.update({
        where: { id: user.id },
        data: { password: hashedPassword },
      })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Forgot password error:', error)
    return NextResponse.json({ error: 'Erro ao redefinir senha' }, { status: 500 })
  }
}
