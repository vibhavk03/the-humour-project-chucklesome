'use client'

import { useEffect, useMemo, useState } from 'react'
import { Term, TermType } from '@/types/term'
import { TermsService } from '@/services/terms.service'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/hooks/use-toast'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Plus, Trash2, Edit, BookOpen, Save, X } from 'lucide-react'
import { useTimeZone } from '@/components/TimeZoneContext'

export default function TermsPage() {
  const { toast } = useToast()
  const { timeZone } = useTimeZone()
  const [terms, setTerms] = useState<Term[]>([])
  const [termTypes, setTermTypes] = useState<TermType[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [editingTerm, setEditingTerm] = useState<Term | null>(null)

  // Form state for new term
  const [newTerm, setNewTerm] = useState('')
  const [newDefinition, setNewDefinition] = useState('')
  const [newExample, setNewExample] = useState('')
  const [newPriority, setNewPriority] = useState(0)
  const [newTermTypeId, setNewTermTypeId] = useState<string>('')

  // Edit form state
  const [editTerm, setEditTerm] = useState('')
  const [editDefinition, setEditDefinition] = useState('')
  const [editExample, setEditExample] = useState('')
  const [editPriority, setEditPriority] = useState(0)
  const [editTermTypeId, setEditTermTypeId] = useState<string>('')

  const [showCreateTermDialog, setShowCreateTermDialog] = useState(false)
  const [termSearch, setTermSearch] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const termsPerPage = 5

  const loadData = async () => {
    setIsLoading(true)
    const [termsData, termTypesData] = await Promise.all([
      TermsService.getAllTerms(),
      TermsService.getAllTermTypes(),
    ])
    setTerms(termsData)
    setTermTypes(termTypesData)
    setIsLoading(false)
  }

  useEffect(() => {
    void loadData()
  }, [])

  const handleCreateTerm = async () => {
    if (
      !newTerm.trim() ||
      !newDefinition.trim() ||
      !newExample.trim() ||
      !newTermTypeId
    ) {
      toast({
        title: 'Missing information',
        description:
          'Please provide term, definition, example, and select a type.',
        variant: 'destructive',
      })
      return
    }

    setIsCreating(true)
    const createdTerm = await TermsService.createTerm({
      term: newTerm.trim(),
      definition: newDefinition.trim(),
      example: newExample.trim(),
      priority: newPriority,
      term_type_id: parseInt(newTermTypeId),
    })

    if (createdTerm) {
      toast({
        title: 'Term created',
        description: `Created "${createdTerm.term}" successfully.`,
      })
      setNewTerm('')
      setNewDefinition('')
      setNewExample('')
      setNewPriority(0)
      setNewTermTypeId('')
      void loadData()
    } else {
      toast({
        title: 'Failed to create term',
        description: 'Please try again.',
        variant: 'destructive',
      })
    }
    setIsCreating(false)
  }

  const handleEditTerm = (term: Term) => {
    setEditingTerm(term)
    setEditTerm(term.term)
    setEditDefinition(term.definition)
    setEditExample(term.example)
    setEditPriority(term.priority)
    setEditTermTypeId(term.term_type_id !== null ? term.term_type_id.toString() : "none")
  }

  const handleSaveEdit = async () => {
    if (
      !editingTerm ||
      !editTerm.trim() ||
      !editDefinition.trim() ||
      !editExample.trim()
    ) {
      toast({
        title: 'Missing information',
        description: 'Please provide term, definition, and example.',
        variant: 'destructive',
      })
      return
    }

    const updatedTerm = await TermsService.updateTerm(editingTerm.id, {
      term: editTerm.trim(),
      definition: editDefinition.trim(),
      example: editExample.trim(),
      priority: editPriority,
      term_type_id:
        editTermTypeId === "none" ? null : parseInt(editTermTypeId),
    })

    if (updatedTerm) {
      toast({
        title: 'Term updated',
        description: `Updated "${updatedTerm.term}" successfully.`,
      })
      setEditingTerm(null)
      void loadData()
    } else {
      toast({
        title: 'Failed to update term',
        description: 'Please try again.',
        variant: 'destructive',
      })
    }
  }

  const handleDeleteTerm = async (id: number) => {
    setDeletingId(id)
    const success = await TermsService.deleteTerm(id)

    if (success) {
      toast({
        title: 'Term deleted',
        description: 'The term has been removed.',
      })
      void loadData()
    } else {
      toast({
        title: 'Failed to delete term',
        description: 'Please try again.',
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
      hour: '2-digit',
      minute: '2-digit',
      timeZone,
      timeZoneName: 'short',
    })
  }

  const normalizedTermSearch = termSearch.trim().toLowerCase()
  const filteredTerms = useMemo(() => {
    if (!normalizedTermSearch) return terms
    return terms.filter((term) =>
      term.term.toLowerCase().includes(normalizedTermSearch)
    )
  }, [normalizedTermSearch, terms])
  const termsCountLabel = normalizedTermSearch
    ? `${filteredTerms.length} / ${terms.length}`
    : `${terms.length}`
  const totalPages = Math.max(1, Math.ceil(filteredTerms.length / termsPerPage))
  const safePage = Math.min(currentPage, totalPages)
  const pageStart = filteredTerms.length === 0 ? 0 : (safePage - 1) * termsPerPage + 1
  const pageEnd = Math.min(filteredTerms.length, safePage * termsPerPage)
  const paginatedTerms = filteredTerms.slice(pageStart - 1, pageEnd)
  const showPagination = filteredTerms.length > termsPerPage

  useEffect(() => {
    setCurrentPage(1)
  }, [normalizedTermSearch])

  useEffect(() => {
    setCurrentPage((prev) => Math.min(prev, totalPages))
  }, [totalPages])

  return (
    <div className="page-shell max-w-6xl mx-auto pb-12">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="page-header">
          <h1 className="page-title">Terms</h1>
          <p className="page-subtitle">
            Manage glossary terms and their definitions.
          </p>
        </div>
        <Button onClick={() => setShowCreateTermDialog(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Create New Term
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5" />
              Terms ({termsCountLabel})
            </CardTitle>
            <div className="w-full md:max-w-xs">
              <Input
                placeholder="Search by term..."
                value={termSearch}
                onChange={(e) => setTermSearch(e.target.value)}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="pb-6">
          {isLoading ? (
            <div className="text-center py-8">
              <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2" />
              <p className="text-muted-foreground">Loading terms...</p>
            </div>
          ) : terms.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-sm">No terms yet</p>
            </div>
          ) : filteredTerms.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-sm">No matching terms</p>
            </div>
          ) : (
            <div className="space-y-4">
              {paginatedTerms.map((term) => (
                <div
                  key={term.id}
                  className="rounded-lg border border-border/60 bg-card/80 p-4 transition-colors hover:bg-muted/40"
                >
                  {editingTerm?.id === term.id ? (
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                          <label className="text-sm font-medium mb-2 block">
                            Term
                          </label>
                          <Input
                            value={editTerm}
                            onChange={(e) => setEditTerm(e.target.value)}
                          />
                        </div>
                        <div>
                          <label className="text-sm font-medium mb-2 block">
                            Type
                          </label>
                          <Select
                            value={editTermTypeId}
                            onValueChange={setEditTermTypeId}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select type" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Unassigned</SelectItem>
                              {termTypes.map((type) => (
                                <SelectItem
                                  key={type.id}
                                  value={type.id.toString()}
                                >
                                  {type.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <label className="text-sm font-medium mb-2 block">
                            Priority
                          </label>
                          <Input
                            type="number"
                            min="0"
                            max="100"
                            value={editPriority}
                            onChange={(e) => {
                              const value = e.target.value
                              if (value === '') {
                                setEditPriority(0)
                              } else {
                                const num = parseInt(value)
                                if (!isNaN(num)) {
                                  const clampedValue = Math.max(
                                    0,
                                    Math.min(100, num)
                                  )
                                  setEditPriority(clampedValue)
                                }
                              }
                            }}
                          />
                        </div>
                      </div>
                      <div>
                        <label className="text-sm font-medium mb-2 block">
                          Definition
                        </label>
                        <Textarea
                          value={editDefinition}
                          onChange={(e) => setEditDefinition(e.target.value)}
                          className="min-h-[100px]"
                        />
                      </div>
                      <div>
                        <label className="text-sm font-medium mb-2 block">
                          Example
                        </label>
                        <Textarea
                          value={editExample}
                          onChange={(e) => setEditExample(e.target.value)}
                          placeholder="Usage example"
                          className="min-h-[100px]"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <Button onClick={handleSaveEdit} size="sm">
                          <Save className="h-4 w-4 mr-1" />
                          Save
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setEditingTerm(null)}
                        >
                          <X className="h-4 w-4 mr-1" />
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 space-y-3">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-lg">{term.term}</h3>
                          <Badge
                            variant="secondary"
                            className="text-[10px] px-1.5 py-0.5"
                          >
                            {term.term_types?.name || 'Unknown Type'}
                          </Badge>
                          <Badge variant="outline" className="text-xs">
                            Priority: {term.priority}
                          </Badge>
                        </div>

                        <div className="space-y-2">
                          <p className="text-sm">{term.definition}</p>

                          {term.example && (
                            <div className="text-sm">
                              <span className="font-bold text-foreground">
                                Example:{' '}
                              </span>
                              <span className="text-muted-foreground">
                                {term.example}
                              </span>
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-4 text-xs text-muted-foreground/70">
                          <span>
                            Created {formatDate(term.created_datetime_utc)}
                          </span>
                          {term.modified_datetime_utc && (
                            <span>
                              Updated {formatDate(term.modified_datetime_utc)}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEditTerm(term)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          disabled={deletingId === term.id}
                          onClick={() => handleDeleteTerm(term.id)}
                        >
                          {deletingId === term.id ? (
                            <span className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          {showPagination && (
            <div className="mt-5 flex flex-col items-center justify-between gap-2 sm:flex-row">
              <p className="text-xs text-muted-foreground">
                Showing {pageStart}-{pageEnd} of {filteredTerms.length}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(1)}
                  disabled={safePage === 1}
                >
                  First
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                  disabled={safePage === 1}
                >
                  Prev
                </Button>
                <span className="text-xs text-muted-foreground">
                  Page {safePage} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                  disabled={safePage === totalPages}
                >
                  Next
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(totalPages)}
                  disabled={safePage === totalPages}
                >
                  Last
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showCreateTermDialog} onOpenChange={setShowCreateTermDialog}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5" />
              Create New Term
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="text-sm font-medium mb-2 block">Term</label>
                <Input
                  placeholder="e.g., suss, chopped"
                  value={newTerm}
                  onChange={(e) => setNewTerm(e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block">
                  Term Type
                </label>
                <Select value={newTermTypeId} onValueChange={setNewTermTypeId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    {termTypes.map((type) => (
                      <SelectItem key={type.id} value={type.id.toString()}>
                        {type.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block">Priority</label>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  value={newPriority}
                  onChange={(e) => {
                    const value = e.target.value
                    if (value === '') {
                      setNewPriority(0)
                    } else {
                      const num = parseInt(value)
                      if (!isNaN(num)) {
                        const clampedValue = Math.max(0, Math.min(100, num))
                        setNewPriority(clampedValue)
                      }
                    }
                  }}
                />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Definition</label>
              <Textarea
                placeholder="Definition of the term..."
                value={newDefinition}
                onChange={(e) => setNewDefinition(e.target.value)}
                className="min-h-[80px]"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Example</label>
              <Textarea
                placeholder="Usage example"
                value={newExample}
                onChange={(e) => setNewExample(e.target.value)}
                className="min-h-[80px]"
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setShowCreateTermDialog(false)}
            >
              Close
            </Button>
            <Button
              onClick={handleCreateTerm}
              disabled={
                isCreating ||
                !newTerm.trim() ||
                !newDefinition.trim() ||
                !newExample.trim() ||
                !newTermTypeId
              }
            >
              {isCreating ? (
                <span className="flex items-center gap-2">
                  <span className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  Creating...
                </span>
              ) : (
                <>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Term
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
