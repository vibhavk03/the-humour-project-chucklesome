'use client'

import { useEffect, useMemo, useState } from 'react'
import { TermType } from '@/types/term'
import { TermsService } from '@/services/terms.service'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useToast } from '@/hooks/use-toast'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Plus, Save, Trash2, Edit, Tag, X } from 'lucide-react'
import { useTimeZone } from '@/components/TimeZoneContext'

export default function TermTypesPage() {
  const { toast } = useToast()
  const { timeZone } = useTimeZone()
  const [termTypes, setTermTypes] = useState<TermType[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [newTermTypeName, setNewTermTypeName] = useState('')
  const [editingTermType, setEditingTermType] = useState<TermType | null>(null)
  const [editTermTypeName, setEditTermTypeName] = useState('')
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  const loadTermTypes = async () => {
    setIsLoading(true)
    const list = await TermsService.getAllTermTypes()
    setTermTypes(list)
    setIsLoading(false)
  }

  useEffect(() => {
    void loadTermTypes()
  }, [])

  const handleCreateTermType = async () => {
    if (!newTermTypeName.trim()) {
      toast({
        title: 'Missing information',
        description: 'Please provide a term type name.',
        variant: 'destructive',
      })
      return
    }

    const createdType = await TermsService.createTermType({
      name: newTermTypeName.trim(),
    })

    if (createdType) {
      toast({
        title: 'Term type created',
        description: `Created "${createdType.name}" successfully.`,
      })
      setNewTermTypeName('')
      setIsAddOpen(false)
      void loadTermTypes()
    } else {
      toast({
        title: 'Failed to create term type',
        description: 'Please try again.',
        variant: 'destructive',
      })
    }
  }

  const startRenameType = (termType: TermType) => {
    setEditingTermType(termType)
    setEditTermTypeName(termType.name)
  }

  const cancelRename = () => {
    setEditingTermType(null)
    setEditTermTypeName('')
  }

  const saveRenameType = async () => {
    if (!editingTermType) return
    const name = editTermTypeName.trim()
    if (!name) {
      toast({ title: 'Name required', variant: 'destructive' })
      return
    }
    const updated = await TermsService.updateTermType(editingTermType.id, { name })
    if (updated) {
      toast({ title: 'Term type renamed', description: `Now "${updated.name}"` })
      cancelRename()
      void loadTermTypes()
    } else {
      toast({ title: 'Failed to rename', variant: 'destructive' })
    }
  }

  const handleDeleteTermType = async (id: number) => {
    setDeletingId(id)
    const success = await TermsService.deleteTermType(id)
    if (success) {
      toast({ title: 'Term type deleted', description: 'The term type has been removed.' })
      void loadTermTypes()
    } else {
      toast({
        title: 'Failed to delete term type',
        description: 'Make sure no terms are using this type, then try again.',
        variant: 'destructive',
      })
    }
    setDeletingId(null)
  }

  const formatDate = (dateValue: unknown) => {
    if (!dateValue) return ''
    const date = dateValue instanceof Date ? dateValue : new Date(String(dateValue))
    if (Number.isNaN(date.getTime())) return ''
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      timeZone,
    })
  }

  const filtered = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    const sorted = [...termTypes].sort((a, b) => a.name.localeCompare(b.name))
    if (!query) return sorted
    return sorted.filter((type) => type.name.toLowerCase().includes(query))
  }, [termTypes, searchQuery])

  return (
    <div className="page-shell max-w-6xl mx-auto pb-12">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="page-header">
          <h1 className="page-title">Term Types</h1>
          <p className="page-subtitle">Organize and maintain term type labels.</p>
        </div>
        <Button onClick={() => setIsAddOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Add Term Type
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <CardTitle className="flex items-center gap-2">
              <Tag className="h-5 w-5" />
              Term Types ({termTypes.length})
            </CardTitle>
            <div className="w-full md:max-w-xs">
              <Input
                placeholder="Search term types..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="pb-6">
          {isLoading ? (
            <div className="text-center py-8">
              <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2" />
              <p className="text-muted-foreground">Loading term types...</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-sm">
                {termTypes.length === 0 ? 'No term types yet' : 'No matching term types'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map((type) => (
                <div
                  key={type.id}
                  className="flex items-center justify-between p-3 border rounded-lg"
                >
                  <div className="flex-1 mr-3">
                    {editingTermType?.id === type.id ? (
                      <Input
                        value={editTermTypeName}
                        onChange={(e) => setEditTermTypeName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') void saveRenameType()
                          if (e.key === 'Escape') cancelRename()
                        }}
                        autoFocus
                      />
                    ) : (
                      <div>
                        <h4 className="font-medium text-base">{type.name}</h4>
                        <p className="text-xs text-muted-foreground">
                          Created {formatDate(type.created_datetime_utc)}
                        </p>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {editingTermType?.id === type.id ? (
                      <>
                        <Button size="sm" onClick={saveRenameType}>
                          <Save className="h-4 w-4 mr-1" /> Save
                        </Button>
                        <Button size="sm" variant="outline" onClick={cancelRename}>
                          <X className="h-4 w-4 mr-1" /> Cancel
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => startRenameType(type)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          disabled={deletingId === type.id}
                          onClick={() => handleDeleteTermType(type.id)}
                        >
                          {deletingId === type.id ? (
                            <span className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New Term Type</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <label className="text-sm font-medium">Type Name</label>
            <Input
              placeholder="e.g., Noun, Verb, Adjective"
              value={newTermTypeName}
              onChange={(e) => setNewTermTypeName(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateTermType} disabled={!newTermTypeName.trim()}>
              <Plus className="h-4 w-4 mr-2" />
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
