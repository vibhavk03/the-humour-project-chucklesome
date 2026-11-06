'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useToast } from '@/hooks/use-toast'
import {
  WhitelistEmailAddressesService,
  type WhitelistEmailAddress,
} from '@/services/whitelist-email-addresses.service'
import { Edit, Plus, Save, Trash2, X } from 'lucide-react'

export default function WhitelistEmailAddressesPage() {
  const { toast } = useToast()
  const [emailAddresses, setEmailAddresses] = useState<WhitelistEmailAddress[]>([])
  const [newEmailAddress, setNewEmailAddress] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isAdding, setIsAdding] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editValue, setEditValue] = useState('')
  const [savingId, setSavingId] = useState<number | null>(null)
  const [deletingId, setDeletingId] = useState<number | null>(null)

  const load = async () => {
    setIsLoading(true)
    const list = await WhitelistEmailAddressesService.list()
    setEmailAddresses(list)
    setIsLoading(false)
  }

  useEffect(() => {
    void load()
  }, [])

  const onAdd = async () => {
    const emailAddress = newEmailAddress.trim().toLowerCase()
    if (!emailAddress) return

    setIsAdding(true)
    const result = await WhitelistEmailAddressesService.add(emailAddress)
    if (result.ok) {
      setNewEmailAddress('')
      void load()
    } else {
      toast({
        title: 'Failed to add e-mail address',
        description: result.message,
        variant: 'destructive',
      })
    }
    setIsAdding(false)
  }

  const startEdit = (entry: WhitelistEmailAddress) => {
    setEditingId(entry.id)
    setEditValue(entry.email_address)
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditValue('')
  }

  const saveEdit = async (id: number) => {
    const emailAddress = editValue.trim().toLowerCase()
    if (!emailAddress) return

    setSavingId(id)
    const result = await WhitelistEmailAddressesService.update(id, emailAddress)
    if (result.ok) {
      cancelEdit()
      void load()
    } else {
      toast({
        title: 'Failed to update e-mail address',
        description: result.message,
        variant: 'destructive',
      })
    }
    setSavingId(null)
  }

  const remove = async (id: number) => {
    setDeletingId(id)
    const result = await WhitelistEmailAddressesService.remove(id)
    if (result.ok) {
      if (editingId === id) {
        cancelEdit()
      }
      void load()
    } else {
      toast({
        title: 'Failed to remove e-mail address',
        description: result.message,
        variant: 'destructive',
      })
    }
    setDeletingId(null)
  }

  return (
    <div className="page-shell max-w-3xl">
      <div className="page-header">
        <h1 className="page-title">E-Mail Addresses</h1>
        <p className="page-subtitle">
          Only users with these exact e-mail addresses can sign up.
        </p>
      </div>

      <div className="flex gap-2">
        <Input
          placeholder="e.g. user@example.com"
          value={newEmailAddress}
          onChange={(e) => setNewEmailAddress(e.target.value)}
        />
        <Button onClick={onAdd} disabled={!newEmailAddress.trim() || isAdding}>
          {isAdding ? (
            <span className="flex items-center gap-2">
              <span className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
              Adding
            </span>
          ) : (
            <>
              <Plus className="mr-1 h-4 w-4" /> Add
            </>
          )}
        </Button>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : emailAddresses.length === 0 ? (
        <div className="text-sm text-muted-foreground">No e-mail addresses yet.</div>
      ) : (
        <div className="space-y-2">
          {emailAddresses.map((entry) => {
            const isEditing = editingId === entry.id
            const isSaving = savingId === entry.id
            const isDeleting = deletingId === entry.id

            return (
              <div
                key={entry.id}
                className="rounded-lg border border-border/60 bg-card/80 px-3 py-2"
              >
                <div className="flex items-center gap-3">
                  <div className="w-16 shrink-0 text-xs text-muted-foreground">
                    Id {entry.id}
                  </div>
                  <div className="flex-1">
                    {isEditing ? (
                      <Input
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            void saveEdit(entry.id)
                          }
                          if (event.key === 'Escape') {
                            cancelEdit()
                          }
                        }}
                        autoFocus
                      />
                    ) : (
                      <div className="text-sm">{entry.email_address}</div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {isEditing ? (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={!editValue.trim() || isSaving}
                          onClick={() => saveEdit(entry.id)}
                        >
                          {isSaving ? (
                            <span className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <Save className="h-4 w-4" />
                          )}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={isSaving}
                          onClick={cancelEdit}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={deletingId !== null}
                        onClick={() => startEdit(entry)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                    )}
                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={isSaving || isDeleting}
                      onClick={() => remove(entry.id)}
                    >
                      {isDeleting ? (
                        <span className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
