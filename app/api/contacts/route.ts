import { NextRequest, NextResponse } from 'next/server'
import { getToken } from 'next-auth/jwt'
import { prisma } from '@/lib/prisma'
import { safeFindUnique, safeFindMany, safeCreate, safeUpdate, safeDelete } from '@/lib/prisma-wrapper'
import type { User, Contact } from '@prisma/client'

// Force dynamic rendering for this route
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const revalidate = 0

// GET - Fetch all contacts for the authenticated user
export async function GET(request: NextRequest) {
  try {
    const token = await getToken({ 
      req: request as any, 
      secret: process.env.NEXTAUTH_SECRET 
    })
    
    if (!token?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await safeFindUnique(prisma.user, {
      where: { email: token.email as string }
    }) as User | null

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const contacts = await safeFindMany(prisma.contact, {
      where: { userId: user.id },
      orderBy: { name: 'asc' }
    }) as Contact[]

    return NextResponse.json({ contacts })
  } catch (error) {
    console.error('Get contacts error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch contacts' },
      { status: 500 }
    )
  }
}

// POST - Create a new contact
export async function POST(request: NextRequest) {
  try {
    const token = await getToken({ 
      req: request as any, 
      secret: process.env.NEXTAUTH_SECRET 
    })
    
    if (!token?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await safeFindUnique(prisma.user, {
      where: { email: token.email as string }
    }) as User | null

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const body = await request.json()
    const { name, email, phone, notes } = body

    // Validation
    if (!name || !email) {
      return NextResponse.json({ error: 'Name and email are required' }, { status: 400 })
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return NextResponse.json({ error: 'Invalid email address' }, { status: 400 })
    }

    // Check if contact already exists
    const existingContact = await safeFindUnique(prisma.contact, {
      where: {
        userId: user.id,
        email: email
      }
    }) as Contact | null

    if (existingContact) {
      return NextResponse.json({ error: 'Contact with this email already exists' }, { status: 409 })
    }

    const contact = await safeCreate(prisma.contact, {
      data: {
        userId: user.id,
        name,
        email,
        phone: phone || null,
        notes: notes || null
      }
    }) as Contact

    return NextResponse.json({ contact }, { status: 201 })
  } catch (error) {
    console.error('Create contact error:', error)
    return NextResponse.json(
      { error: 'Failed to create contact' },
      { status: 500 }
    )
  }
}

// PUT - Update an existing contact
export async function PUT(request: NextRequest) {
  try {
    const token = await getToken({ 
      req: request as any, 
      secret: process.env.NEXTAUTH_SECRET 
    })
    
    if (!token?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await safeFindUnique(prisma.user, {
      where: { email: token.email as string }
    }) as User | null

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const body = await request.json()
    const { id, name, email, phone, notes } = body

    // Validation
    if (!id || !name || !email) {
      return NextResponse.json({ error: 'ID, name and email are required' }, { status: 400 })
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return NextResponse.json({ error: 'Invalid email address' }, { status: 400 })
    }

    // Check if contact exists and belongs to user
    const existingContact = await safeFindUnique(prisma.contact, {
      where: {
        id,
        userId: user.id
      }
    }) as Contact | null

    if (!existingContact) {
      return NextResponse.json({ error: 'Contact not found' }, { status: 404 })
    }

    // Check if email is already used by another contact
    const emailConflict = await safeFindUnique(prisma.contact, {
      where: {
        userId: user.id,
        email: email,
        id: { not: id }
      }
    }) as Contact | null

    if (emailConflict) {
      return NextResponse.json({ error: 'Another contact with this email already exists' }, { status: 409 })
    }

    const contact = await safeUpdate(prisma.contact, {
      where: { id },
      data: {
        name,
        email,
        phone: phone || null,
        notes: notes || null
      }
    }) as Contact

    return NextResponse.json({ contact })
  } catch (error) {
    console.error('Update contact error:', error)
    return NextResponse.json(
      { error: 'Failed to update contact' },
      { status: 500 }
    )
  }
}

// DELETE - Delete a contact
export async function DELETE(request: NextRequest) {
  try {
    const token = await getToken({ 
      req: request as any, 
      secret: process.env.NEXTAUTH_SECRET 
    })
    
    if (!token?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await safeFindUnique(prisma.user, {
      where: { email: token.email as string }
    }) as User | null

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const { searchParams } = request.nextUrl
    const contactId = searchParams.get('id')

    if (!contactId) {
      return NextResponse.json({ error: 'Contact ID is required' }, { status: 400 })
    }

    // Check if contact exists and belongs to user
    const existingContact = await safeFindUnique(prisma.contact, {
      where: {
        id: contactId,
        userId: user.id
      }
    }) as Contact | null

    if (!existingContact) {
      return NextResponse.json({ error: 'Contact not found' }, { status: 404 })
    }

    await safeDelete(prisma.contact, {
      where: { id: contactId }
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Delete contact error:', error)
    return NextResponse.json(
      { error: 'Failed to delete contact' },
      { status: 500 }
    )
  }
}