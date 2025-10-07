'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Plus,
  Search,
  Edit,
  Trash2,
  Mail,
  Phone,
  User,
  Save,
  X
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useToast } from '@/components/ui/use-toast'
import { createCSRFHeaders } from '@/lib/utils/csrf-client'

interface Contact {
  id: string
  name: string
  email: string
  phone?: string
  notes?: string
  createdAt: string
  updatedAt: string
}

interface ContactsTabProps {
  onSendEmailToContact?: (contactEmail: string, contactName: string) => void
}

export function ContactsTab({ onSendEmailToContact }: ContactsTabProps) {
  const { toast } = useToast()
  const [contacts, setContacts] = useState<Contact[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [isAddingContact, setIsAddingContact] = useState(false)
  const [editingContact, setEditingContact] = useState<Contact | null>(null)
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    notes: ''
  })

  // Load contacts on component mount
  useEffect(() => {
    loadContacts()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadContacts = async () => {
    try {
      setIsLoading(true)
      const response = await fetch('/api/contacts')
      if (response.ok) {
        const data = await response.json()
        setContacts(data.contacts)
      } else {
        throw new Error('Failed to load contacts')
      }
    } catch (error) {
      console.error('Error loading contacts:', error)
      toast({
        title: 'Error',
        description: 'Failed to load contacts',
        variant: 'destructive'
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleAddContact = async () => {
    try {
      if (!formData.name || !formData.email) {
        toast({
          title: 'Error',
          description: 'Name and email are required',
          variant: 'destructive'
        })
        return
      }

      const headers = await createCSRFHeaders()
      const response = await fetch('/api/contacts', {
        method: 'POST',
        headers,
        body: JSON.stringify(formData)
      })

      if (response.ok) {
        const data = await response.json()
        setContacts([...contacts, data.contact])
        setFormData({ name: '', email: '', phone: '', notes: '' })
        setIsAddingContact(false)
        toast({
          title: 'Success',
          description: 'Contact added successfully'
        })
      } else {
        const error = await response.json()
        throw new Error(error.error || 'Failed to add contact')
      }
    } catch (error) {
      console.error('Error adding contact:', error)
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to add contact',
        variant: 'destructive'
      })
    }
  }

  const handleUpdateContact = async () => {
    try {
      if (!editingContact || !formData.name || !formData.email) {
        toast({
          title: 'Error',
          description: 'Name and email are required',
          variant: 'destructive'
        })
        return
      }

      const headers = await createCSRFHeaders()
      const response = await fetch('/api/contacts', {
        method: 'PUT',
        headers,
        body: JSON.stringify({ id: editingContact.id, ...formData })
      })

      if (response.ok) {
        const data = await response.json()
        setContacts(contacts.map(c => c.id === editingContact.id ? data.contact : c))
        setFormData({ name: '', email: '', phone: '', notes: '' })
        setEditingContact(null)
        toast({
          title: 'Success',
          description: 'Contact updated successfully'
        })
      } else {
        const error = await response.json()
        throw new Error(error.error || 'Failed to update contact')
      }
    } catch (error) {
      console.error('Error updating contact:', error)
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to update contact',
        variant: 'destructive'
      })
    }
  }

  const handleDeleteContact = async (contactId: string) => {
    try {
      const headers = await createCSRFHeaders()
      const response = await fetch(`/api/contacts?id=${contactId}`, {
        method: 'DELETE',
        headers
      })

      if (response.ok) {
        setContacts(contacts.filter(c => c.id !== contactId))
        toast({
          title: 'Success',
          description: 'Contact deleted successfully'
        })
      } else {
        const error = await response.json()
        throw new Error(error.error || 'Failed to delete contact')
      }
    } catch (error) {
      console.error('Error deleting contact:', error)
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to delete contact',
        variant: 'destructive'
      })
    }
  }

  const startEdit = (contact: Contact) => {
    setEditingContact(contact)
    setFormData({
      name: contact.name,
      email: contact.email,
      phone: contact.phone || '',
      notes: contact.notes || ''
    })
    setIsAddingContact(false)
  }

  const cancelEdit = () => {
    setEditingContact(null)
    setIsAddingContact(false)
    setFormData({ name: '', email: '', phone: '', notes: '' })
  }

  const filteredContacts = contacts.filter(contact =>
    contact.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    contact.email.toLowerCase().includes(searchQuery.toLowerCase())
  )

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Contacts</h2>
        <Button
          onClick={() => {
            setIsAddingContact(true)
            setEditingContact(null)
            setFormData({ name: '', email: '', phone: '', notes: '' })
          }}
          className="flex items-center gap-2"
        >
          <Plus className="h-4 w-4" />
          Add Contact
        </Button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
        <Input
          placeholder="Search contacts..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Add/Edit Contact Form */}
      <AnimatePresence>
        {(isAddingContact || editingContact) && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
          >
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  {editingContact ? 'Edit Contact' : 'Add New Contact'}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={cancelEdit}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium mb-2 block">Name *</label>
                    <Input
                      placeholder="Contact name"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-2 block">Email *</label>
                    <Input
                      type="email"
                      placeholder="contact@example.com"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    />
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium mb-2 block">Phone</label>
                  <Input
                    placeholder="Phone number"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-2 block">Notes</label>
                  <Textarea
                    placeholder="Additional notes..."
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    rows={3}
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={editingContact ? handleUpdateContact : handleAddContact}
                    className="flex items-center gap-2"
                  >
                    <Save className="h-4 w-4" />
                    {editingContact ? 'Update' : 'Add'} Contact
                  </Button>
                  <Button variant="outline" onClick={cancelEdit}>
                    Cancel
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Contacts List */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <AnimatePresence>
          {filteredContacts.map((contact) => (
            <motion.div
              key={contact.id}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.2 }}
            >
              <Card className="hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className="bg-primary/10 p-2 rounded-full">
                        <User className="h-4 w-4 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-semibold">{contact.name}</h3>
                        <p className="text-sm text-muted-foreground">{contact.email}</p>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => startEdit(contact)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteContact(contact.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  
                  {contact.phone && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                      <Phone className="h-3 w-3" />
                      {contact.phone}
                    </div>
                  )}
                  
                  {contact.notes && (
                    <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
                      {contact.notes}
                    </p>
                  )}
                  
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full flex items-center gap-2"
                    onClick={() => onSendEmailToContact?.(contact.email, contact.name)}
                  >
                    <Mail className="h-4 w-4" />
                    Send Email
                  </Button>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {filteredContacts.length === 0 && (
        <div className="text-center py-12">
          <User className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2">No contacts found</h3>
          <p className="text-muted-foreground mb-4">
            {searchQuery ? 'No contacts match your search.' : 'Start by adding your first contact.'}
          </p>
          {!searchQuery && (
            <Button
              onClick={() => {
                setIsAddingContact(true)
                setEditingContact(null)
                setFormData({ name: '', email: '', phone: '', notes: '' })
              }}
              className="flex items-center gap-2"
            >
              <Plus className="h-4 w-4" />
              Add Your First Contact
            </Button>
          )}
        </div>
      )}
    </div>
  )
}