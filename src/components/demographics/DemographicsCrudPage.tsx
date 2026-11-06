'use client'

import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'
import {
  ArrowUpAZ,
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  GripVertical,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import {
  DemographicsService,
  type DemographicAnswer,
  type DemographicMapping,
  type DemographicProfile,
  type DemographicQuestion,
  type DemographicResponse,
} from '@/services/demographics.service'

export type DemographicsPageKind =
  | 'questions'
  | 'answers'
  | 'mappings'
  | 'responses'
type RecordRow =
  | DemographicQuestion
  | DemographicAnswer
  | DemographicMapping
  | DemographicResponse

const PAGE_COPY = {
  questions: {
    title: 'Demographic Questions',
    subtitle: 'Create and manage questions shown to users.',
    singular: 'question',
    bulkHelp: 'Paste one question per line.',
    bulkPlaceholder: 'What is your age range?\nWhere do you live?',
  },
  answers: {
    title: 'Demographic Answers',
    subtitle: 'Create and manage reusable answer choices.',
    singular: 'answer',
    bulkHelp: 'Paste one answer per line.',
    bulkPlaceholder: '18–24\n25–34\n35–44',
  },
  mappings: {
    title: 'Question–Answer Mapping',
    subtitle: 'Assign answers to questions and control their display order.',
    singular: 'mapping',
    bulkHelp:
      'Paste CSV or tab-separated rows: question_id, answer_id, display_order, is_deleted. The final two values are optional.',
    bulkPlaceholder: '1, 4, 0, false\n1, 5, 1, false',
  },
  responses: {
    title: 'User Responses',
    subtitle: 'Review and manage users’ demographic selections.',
    singular: 'response',
    bulkHelp:
      'Paste CSV or tab-separated rows: user_id, answer_question_mapping_id.',
    bulkPlaceholder: 'user-uuid, 12\nanother-user-uuid, 15',
  },
} satisfies Record<
  DemographicsPageKind,
  {
    title: string
    subtitle: string
    singular: string
    bulkHelp: string
    bulkPlaceholder: string
  }
>

const emptyForm = {
  question: '',
  answer: '',
  questionId: '',
  answerId: '',
  displayOrder: '0',
  isDeleted: false,
  userId: '',
  mappingId: '',
}

const FILTERS: Record<
  DemographicsPageKind,
  { value: string; label: string }[]
> = {
  questions: [
    { value: 'all', label: 'Any field' },
    { value: 'question', label: 'Question' },
    { value: 'created', label: 'Created date' },
    { value: 'modified', label: 'Modified date' },
    { value: 'createdBy', label: 'Created by user Id' },
    { value: 'modifiedBy', label: 'Modified by user Id' },
  ],
  answers: [
    { value: 'all', label: 'Any field' },
    { value: 'answer', label: 'Answer' },
    { value: 'created', label: 'Created date' },
    { value: 'modified', label: 'Modified date' },
    { value: 'createdBy', label: 'Created by user Id' },
    { value: 'modifiedBy', label: 'Modified by user Id' },
  ],
  mappings: [
    { value: 'all', label: 'Any field' },
    { value: 'question', label: 'Question / Id' },
    { value: 'answer', label: 'Answer / Id' },
    { value: 'order', label: 'Display order' },
    { value: 'deleted', label: 'Deleted status' },
    { value: 'created', label: 'Created date' },
    { value: 'modified', label: 'Modified date' },
    { value: 'createdBy', label: 'Created by user Id' },
    { value: 'modifiedBy', label: 'Modified by user Id' },
  ],
  responses: [
    { value: 'all', label: 'Any field' },
    { value: 'user', label: 'User / User Id' },
    { value: 'mapping', label: 'Question, answer, or mapping Id' },
    { value: 'created', label: 'Created date' },
    { value: 'modified', label: 'Modified date' },
  ],
}

export default function DemographicsCrudPage({
  kind,
}: {
  kind: DemographicsPageKind
}) {
  const copy = PAGE_COPY[kind]
  const isReadOnly = kind === 'responses'
  const tableColumnCount =
    2 +
    (kind === 'mappings' ? 4 : kind === 'responses' ? 2 : 1) +
    (isReadOnly ? 0 : 2)
  const { toast } = useToast()
  const [rows, setRows] = useState<RecordRow[]>([])
  const [questions, setQuestions] = useState<DemographicQuestion[]>([])
  const [answers, setAnswers] = useState<DemographicAnswer[]>([])
  const [mappings, setMappings] = useState<DemographicMapping[]>([])
  const [profiles, setProfiles] = useState<DemographicProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const deferredSearch = useDeferredValue(search)
  const [filterField, setFilterField] = useState('all')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [dialogOpen, setDialogOpen] = useState(false)
  const [createAnother, setCreateAnother] = useState(false)
  const [entrySequence, setEntrySequence] = useState(0)
  const [bulkOpen, setBulkOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [bulkText, setBulkText] = useState('')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState(emptyForm)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      if (kind === 'questions') {
        const data = await DemographicsService.listQuestions()
        setQuestions(data)
        setRows(data)
      } else if (kind === 'answers') {
        const data = await DemographicsService.listAnswers()
        setAnswers(data)
        setRows(data)
      } else if (kind === 'mappings') {
        const [questionRows, answerRows, mappingRows] = await Promise.all([
          DemographicsService.listQuestions(),
          DemographicsService.listAnswers(),
          DemographicsService.listMappings(),
        ])
        setQuestions(questionRows)
        setAnswers(answerRows)
        setMappings(mappingRows)
        setRows(mappingRows)
      } else {
        const [
          questionRows,
          answerRows,
          mappingRows,
          profileRows,
          responseRows,
        ] = await Promise.all([
          DemographicsService.listQuestions(),
          DemographicsService.listAnswers(),
          DemographicsService.listMappings(),
          DemographicsService.listProfiles(),
          DemographicsService.listResponses(),
        ])
        setQuestions(questionRows)
        setAnswers(answerRows)
        setMappings(mappingRows)
        setProfiles(profileRows)
        setRows(responseRows)
      }
      setSelected(new Set())
    } catch (error) {
      toast({
        title: 'Unable to load demographics',
        description: errorMessage(error),
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }, [kind, toast])

  useEffect(() => {
    void load()
  }, [load])
  useEffect(() => {
    setPage(1)
  }, [deferredSearch, filterField, pageSize])

  const questionMap = useMemo(
    () => new Map(questions.map((item) => [item.id, item.question])),
    [questions]
  )
  const answerMap = useMemo(
    () => new Map(answers.map((item) => [item.id, item.answer])),
    [answers]
  )
  const mappingMap = useMemo(
    () => new Map(mappings.map((item) => [item.id, item])),
    [mappings]
  )
  const profileMap = useMemo(
    () => new Map(profiles.map((item) => [item.id, item])),
    [profiles]
  )
  const questionLabel = useCallback(
    (id: number) => questionMap.get(id) ?? `Question ${id}`,
    [questionMap]
  )
  const answerLabel = useCallback(
    (id: number) => answerMap.get(id) ?? `Answer ${id}`,
    [answerMap]
  )
  const mappingLabel = useCallback(
    (id: number) => {
      const item = mappingMap.get(id)
      return item
        ? `${questionLabel(item.question_id)} — ${answerLabel(item.answer_id)}`
        : `Mapping ${id}`
    },
    [mappingMap, questionLabel, answerLabel]
  )
  const profileLabel = useCallback(
    (id: string) => {
      const item = profileMap.get(id)
      if (!item) return id
      return (
        [item.first_name, item.last_name].filter(Boolean).join(' ') ||
        item.email ||
        item.id
      )
    },
    [profileMap]
  )

  const fieldText = useCallback(
    (row: RecordRow, field: string) => {
      const common: Record<string, string> = {
        id: String(row.id),
        created: String(row.created_datetime_utc ?? ''),
        modified: String(row.modified_datetime_utc ?? ''),
        createdBy:
          'created_by_user_id' in row ? String(row.created_by_user_id) : '',
        modifiedBy:
          'modified_by_user_id' in row ? String(row.modified_by_user_id) : '',
      }
      if (field in common) return common[field]
      if (field === 'question') {
        if ('question' in row) return row.question
        if ('question_id' in row)
          return `${row.question_id} ${questionLabel(row.question_id)}`
      }
      if (field === 'answer') {
        if ('answer' in row) return row.answer
        if ('answer_id' in row)
          return `${row.answer_id} ${answerLabel(row.answer_id)}`
      }
      if (field === 'order' && 'display_order' in row)
        return String(row.display_order)
      if (field === 'deleted' && 'is_deleted' in row)
        return row.is_deleted ? 'true yes deleted' : 'false no active'
      if (field === 'user' && 'user_id' in row)
        return `${row.user_id} ${profileLabel(row.user_id)}`
      if (field === 'mapping' && 'answer_question_mapping_id' in row)
        return `${row.answer_question_mapping_id} ${mappingLabel(row.answer_question_mapping_id)}`
      return ''
    },
    [questionLabel, answerLabel, profileLabel, mappingLabel]
  )

  const filtered = useMemo(() => {
    const query = deferredSearch.trim().toLocaleLowerCase()
    if (!query) return rows
    return rows.filter((row) => {
      const text =
        filterField === 'all'
          ? `${Object.values(row).join(' ')} ${fieldText(row, 'question')} ${fieldText(row, 'answer')} ${fieldText(row, 'user')} ${fieldText(row, 'mapping')} ${fieldText(row, 'deleted')}`
          : fieldText(row, filterField)
      return text.toLocaleLowerCase().includes(query)
    })
  }, [rows, deferredSearch, filterField, fieldText])

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize))
  const safePage = Math.min(page, pageCount)
  const pageRows = useMemo(
    () => filtered.slice((safePage - 1) * pageSize, safePage * pageSize),
    [filtered, safePage, pageSize]
  )
  const allPageSelected =
    pageRows.length > 0 && pageRows.every((row) => selected.has(row.id))

  const togglePage = (checked: boolean) =>
    setSelected((current) => {
      const next = new Set(current)
      pageRows.forEach((row) =>
        checked ? next.add(row.id) : next.delete(row.id)
      )
      return next
    })

  const openCreate = () => {
    if (isReadOnly) return
    setEditingId(null)
    setCreateAnother(false)
    setForm({
      ...emptyForm,
      questionId: String(questions[0]?.id ?? ''),
      answerId: String(answers[0]?.id ?? ''),
      mappingId: String(mappings[0]?.id ?? ''),
      userId: profiles[0]?.id ?? '',
    })
    setDialogOpen(true)
  }

  const openEdit = (row: RecordRow) => {
    if (isReadOnly) return
    setEditingId(row.id)
    setCreateAnother(false)
    setForm({
      ...emptyForm,
      question: 'question' in row ? row.question : '',
      answer: 'answer' in row ? row.answer : '',
      questionId: 'question_id' in row ? String(row.question_id) : '',
      answerId: 'answer_id' in row ? String(row.answer_id) : '',
      displayOrder: 'display_order' in row ? String(row.display_order) : '0',
      isDeleted: 'is_deleted' in row ? row.is_deleted : false,
      userId: 'user_id' in row ? row.user_id : '',
      mappingId:
        'answer_question_mapping_id' in row
          ? String(row.answer_question_mapping_id)
          : '',
    })
    setDialogOpen(true)
  }

  const save = async () => {
    if (isReadOnly) return
    setSaving(true)
    try {
      if (kind === 'questions') {
        if (!form.question.trim()) throw new Error('Question is required.')
        await (editingId
          ? DemographicsService.updateQuestion(editingId, form.question.trim())
          : DemographicsService.createQuestion(form.question.trim()))
      } else if (kind === 'answers') {
        if (!form.answer.trim()) throw new Error('Answer is required.')
        await (editingId
          ? DemographicsService.updateAnswer(editingId, form.answer.trim())
          : DemographicsService.createAnswer(form.answer.trim()))
      } else if (kind === 'mappings') {
        const values = mappingValues(
          form.questionId,
          form.answerId,
          form.displayOrder,
          form.isDeleted
        )
        await (editingId
          ? DemographicsService.updateMapping(editingId, values)
          : DemographicsService.createMapping(values))
      } else {
        if (!form.userId || !form.mappingId)
          throw new Error('User and mapping are required.')
        const values = {
          user_id: form.userId,
          answer_question_mapping_id: positiveInteger(
            form.mappingId,
            'Mapping Id'
          ),
        }
        await (editingId
          ? DemographicsService.updateResponse(editingId, values)
          : DemographicsService.createResponse(values))
      }
      toast({ title: 'Record saved' })
      await load()
      if (!editingId && createAnother) {
        setForm((current) => ({
          ...current,
          question: '',
          answer: '',
          displayOrder:
            kind === 'mappings'
              ? String(Number(current.displayOrder || 0) + 1)
              : current.displayOrder,
        }))
        setEntrySequence((value) => value + 1)
      } else {
        setDialogOpen(false)
      }
    } catch (error) {
      console.error('Failed to save demographic record:', error)
      toast({
        title: 'Save failed',
        description: errorMessage(error),
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  const bulkSave = async () => {
    if (isReadOnly) return
    setSaving(true)
    try {
      const lines = bulkText
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
      if (!lines.length) throw new Error('Paste at least one non-empty row.')
      if (kind === 'questions') await DemographicsService.createQuestions(lines)
      else if (kind === 'answers')
        await DemographicsService.createAnswers(lines)
      else if (kind === 'mappings')
        await DemographicsService.createMappings(
          lines.map((line, index) => {
            const cells = splitRow(line)
            if (cells.length < 2)
              throw new Error(
                `Line ${index + 1}: question Id and answer Id are required.`
              )
            return mappingValues(
              cells[0],
              cells[1],
              cells[2] || '0',
              parseBoolean(cells[3], index + 1)
            )
          })
        )
      else
        await DemographicsService.createResponses(
          lines.map((line, index) => {
            const cells = splitRow(line)
            if (cells.length < 2 || !cells[0])
              throw new Error(
                `Line ${index + 1}: user Id and mapping Id are required.`
              )
            return {
              user_id: cells[0],
              answer_question_mapping_id: positiveInteger(
                cells[1],
                `Line ${index + 1} mapping Id`
              ),
            }
          })
        )
      setBulkOpen(false)
      setBulkText('')
      toast({ title: `${lines.length} records added` })
      await load()
    } catch (error) {
      toast({
        title: 'Bulk import failed',
        description: errorMessage(error),
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  const bulkDelete = async () => {
    if (isReadOnly) return
    const ids = [...selected]
    if (!ids.length) {
      setDeleteOpen(false)
      return
    }
    setDeleting(true)
    try {
      await DemographicsService.deleteMany(kind, ids)
      setDeleteOpen(false)
      toast({ title: `${ids.length} records deleted` })
      await load()
    } catch (error) {
      toast({
        title: 'Bulk delete failed',
        description: errorMessage(error),
        variant: 'destructive',
      })
    } finally {
      setDeleting(false)
    }
  }

  const setMappingStatus = async (isDeleted: boolean) => {
    try {
      await DemographicsService.setMappingsDeleted([...selected], isDeleted)
      toast({
        title: `Selected mappings marked ${isDeleted ? 'deleted' : 'active'}`,
      })
      await load()
    } catch (error) {
      toast({
        title: 'Bulk update failed',
        description: errorMessage(error),
        variant: 'destructive',
      })
    }
  }

  if (kind === 'mappings') {
    return (
      <MappingsBoard
        copy={copy}
        questions={questions}
        answers={answers}
        mappings={mappings}
        loading={loading}
        onReload={load}
      />
    )
  }

  return (
    <div className="page-shell">
      <div className="page-header">
        <h1 className="page-title">{copy.title}</h1>
        <p className="page-subtitle">{copy.subtitle}</p>
      </div>
      <Card>
        <CardContent className="space-y-4 p-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex w-full flex-col gap-2 sm:flex-row xl:max-w-3xl">
              <NativeSelect
                value={filterField}
                onChange={setFilterField}
                options={FILTERS[kind]}
                className="sm:w-52"
              />
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search or filter records…"
                  className="pl-9"
                />
              </div>
            </div>
            {!isReadOnly && (
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  onClick={() => setBulkOpen(true)}
                  className="gap-2"
                >
                  <Upload className="h-4 w-4" />
                  Bulk add
                </Button>
                <Button onClick={openCreate} className="gap-2">
                  <Plus className="h-4 w-4" />
                  Add {copy.singular}
                </Button>
              </div>
            )}
          </div>

          {!isReadOnly && selected.size > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/50 p-3 text-sm">
              <span className="mr-2 font-medium">{selected.size} selected</span>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => setDeleteOpen(true)}
              >
                <Trash2 className="mr-1 h-4 w-4" />
                Delete selected
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setSelected(new Set())}
              >
                Clear
              </Button>
            </div>
          )}

          <div className="table-shell overflow-x-auto">
            <table className="table-base w-full">
              <thead className="table-head">
                <tr>
                  {!isReadOnly && (
                    <th className="w-10">
                      <Checkbox
                        checked={allPageSelected}
                        onCheckedChange={(value) => togglePage(value === true)}
                        aria-label="Select visible records"
                      />
                    </th>
                  )}
                  {kind === 'questions' && <th>Question</th>}
                  {kind === 'answers' && <th>Answer</th>}
                  {kind === 'responses' && (
                    <>
                      <th>User</th>
                      <th>Question and answer</th>
                    </>
                  )}
                  <th>Created UTC</th>
                  <th>Modified UTC</th>
                  {!isReadOnly && <th className="text-right">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td
                      colSpan={tableColumnCount}
                      className="text-muted-foreground"
                    >
                      Loading…
                    </td>
                  </tr>
                ) : pageRows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={tableColumnCount}
                      className="text-muted-foreground"
                    >
                      No records found.
                    </td>
                  </tr>
                ) : (
                  pageRows.map((row) => (
                    <tr key={row.id}>
                      {!isReadOnly && (
                        <td>
                          <Checkbox
                            checked={selected.has(row.id)}
                            onCheckedChange={(value) =>
                              setSelected((current) => {
                                const next = new Set(current)
                                value === true
                                  ? next.add(row.id)
                                  : next.delete(row.id)
                                return next
                              })
                            }
                            aria-label={`Select record ${row.id}`}
                          />
                        </td>
                      )}
                      {kind === 'questions' && (
                        <td>{(row as DemographicQuestion).question}</td>
                      )}
                      {kind === 'answers' && (
                        <td>{(row as DemographicAnswer).answer}</td>
                      )}
                      {kind === 'responses' && (
                        <>
                          <td>
                            {profileLabel((row as DemographicResponse).user_id)}
                          </td>
                          <td>
                            {mappingLabel(
                              (row as DemographicResponse)
                                .answer_question_mapping_id
                            )}
                          </td>
                        </>
                      )}
                      <td className="whitespace-nowrap text-xs text-muted-foreground">
                        {formatUtc(row.created_datetime_utc)}
                      </td>
                      <td className="whitespace-nowrap text-xs text-muted-foreground">
                        {formatUtc(row.modified_datetime_utc)}
                      </td>
                      {!isReadOnly && (
                        <td>
                          <div className="flex justify-end">
                            <Button
                              variant="outline"
                              size="icon"
                              onClick={() => openEdit(row)}
                              aria-label={`Edit ${copy.singular}`}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col gap-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <span>
              {filtered.length
                ? `${(safePage - 1) * pageSize + 1}–${Math.min(safePage * pageSize, filtered.length)} of ${filtered.length}`
                : '0 records'}
              {filtered.length !== rows.length && ` (${rows.length} total)`}
            </span>
            <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap sm:justify-end">
              <span>Rows</span>
              <NativeSelect
                value={String(pageSize)}
                onChange={(value) => setPageSize(Number(value))}
                options={[25, 50, 100].map((size) => ({
                  value: String(size),
                  label: String(size),
                }))}
                className="w-20"
              />
              <Button
                variant="outline"
                size="sm"
                disabled={safePage <= 1}
                onClick={() => setPage((value) => value - 1)}
                className="min-w-24 bg-background"
              >
                <ChevronLeft className="h-4 w-4" strokeWidth={2.5} />
                Previous
              </Button>
              <span className="min-w-20 text-center">
                {safePage} / {pageCount}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={safePage >= pageCount}
                onClick={() => setPage((value) => value + 1)}
                className="min-w-24 bg-background"
              >
                Next
                <ChevronRight className="h-4 w-4" strokeWidth={2.5} />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <AlertDialog
        open={!isReadOnly && deleteOpen}
        onOpenChange={setDeleteOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete selected records?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete {selected.size} selected{' '}
              {selected.size === 1 ? copy.singular : 'records'}. This action
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <Button
              variant="destructive"
              onClick={() => void bulkDelete()}
              disabled={deleting}
              className="gap-2"
            >
              <Trash2 className="h-4 w-4" />
              {deleting ? 'Deleting...' : 'Delete'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        open={!isReadOnly && dialogOpen}
        onOpenChange={(open) => {
          if (isReadOnly) return
          setDialogOpen(open)
          if (!open) setCreateAnother(false)
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingId ? 'Edit' : 'Add'} {copy.singular}
            </DialogTitle>
          </DialogHeader>
          <form
            className="space-y-5"
            onSubmit={(event) => {
              event.preventDefault()
              if (!saving) void save()
            }}
          >
            <RecordFields
              key={entrySequence}
              kind={kind}
              form={form}
              setForm={setForm}
              questions={questions}
              answers={answers}
              mappings={mappings}
              profiles={profiles}
              profileLabel={profileLabel}
              mappingLabel={mappingLabel}
            />
            {!editingId && (
              <div className="flex items-start gap-2 rounded-lg border border-border/70 bg-muted/40 p-3">
                <Checkbox
                  id="create-another-demographic-entry"
                  checked={createAnother}
                  onCheckedChange={(checked) =>
                    setCreateAnother(checked === true)
                  }
                />
                <div className="grid gap-1">
                  <Label htmlFor="create-another-demographic-entry">
                    Create another entry after saving
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Press Enter to save, reset the form, and continue adding
                    entries until you close this window.
                  </p>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving
                  ? 'Saving…'
                  : createAnother && !editingId
                    ? 'Save & add another'
                    : 'Save'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!isReadOnly && bulkOpen} onOpenChange={setBulkOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Bulk add {copy.title.toLowerCase()}</DialogTitle>
            <DialogDescription>
              {copy.bulkHelp} Empty lines are ignored, and the entire batch is
              validated before submission.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            className="min-h-64 font-mono text-sm"
            value={bulkText}
            onChange={(event) => setBulkText(event.target.value)}
            placeholder={copy.bulkPlaceholder}
          />
          <div className="text-sm text-muted-foreground">
            {bulkText.split(/\r?\n/).filter((line) => line.trim()).length} rows
            ready
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => void bulkSave()}
              disabled={saving || !bulkText.trim()}
            >
              {saving ? 'Importing…' : 'Import records'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

type MappingDraft = Record<number, number[]>
type MappingDragPayload = {
  answerIds: number[]
  fromQuestionId: number | null
}
type ActiveMappingDrag = MappingDragPayload & {
  label: string
  pointerId: number
  x: number
  y: number
  grabOffsetX: number
  grabOffsetY: number
  width: number
}
type MappingDropTarget = {
  questionId: number
  insertIndex: number
}
type AnswerPanelFrame = {
  left: number
  top: number
  width: number
  height: number
  visible: boolean
}
type MappingUpdate = Pick<
  DemographicMapping,
  'id' | 'question_id' | 'answer_id' | 'display_order' | 'is_deleted'
>
type MappingCreate = Pick<
  DemographicMapping,
  'question_id' | 'answer_id' | 'display_order' | 'is_deleted'
>

const ANSWER_PANEL_TOP = 72
const ANSWER_PANEL_GAP = 16
const ANSWER_PANEL_MIN_HEIGHT = 180
const ANSWER_PANEL_LAYOUT_TRACK_MS = 320

function MappingsBoard({
  copy,
  questions,
  answers,
  mappings,
  loading,
  onReload,
}: {
  copy: { title: string; subtitle: string }
  questions: DemographicQuestion[]
  answers: DemographicAnswer[]
  mappings: DemographicMapping[]
  loading: boolean
  onReload: () => Promise<void>
}) {
  const { toast } = useToast()
  const [draftByQuestion, setDraftByQuestion] = useState<MappingDraft>({})
  const [visibleQuestionIds, setVisibleQuestionIds] = useState<number[]>([])
  const [answerSearch, setAnswerSearch] = useState('')
  const deferredAnswerSearch = useDeferredValue(answerSearch)
  const [answerQuestionFilter, setAnswerQuestionFilter] = useState('')
  const [selectedAvailableAnswerIds, setSelectedAvailableAnswerIds] = useState<
    number[]
  >([])
  const [questionToAdd, setQuestionToAdd] = useState('')
  const [applying, setApplying] = useState(false)
  const [portalReady, setPortalReady] = useState(false)
  const [dragOverQuestionId, setDragOverQuestionId] = useState<number | null>(
    null
  )
  const [activeDrag, setActiveDrag] = useState<ActiveMappingDrag | null>(null)
  const activeDragRef = useRef<ActiveMappingDrag | null>(null)
  const answerPanelAnchorRef = useRef<HTMLElement | null>(null)
  const fixedAnswerPanelRef = useRef<HTMLDivElement | null>(null)
  const mappingGridRef = useRef<HTMLDivElement | null>(null)
  const answerPanelFrameRef = useRef<AnswerPanelFrame | null>(null)
  const draftByQuestionRef = useRef<MappingDraft>({})
  const dropTargetRef = useRef<MappingDropTarget | null>(null)

  const questionById = useMemo(
    () => new Map(questions.map((question) => [question.id, question])),
    [questions]
  )
  const answerById = useMemo(
    () => new Map(answers.map((answer) => [answer.id, answer])),
    [answers]
  )
  const initialState = useMemo(
    () => buildInitialMappingState(questions, answers, mappings),
    [questions, answers, mappings]
  )
  const inactiveAnswersByQuestion = useMemo(
    () => buildInactiveAnswersByQuestion(answers, mappings),
    [answers, mappings]
  )
  const visibleQuestionSet = useMemo(
    () => new Set(visibleQuestionIds),
    [visibleQuestionIds]
  )
  const visibleQuestions = useMemo(
    () =>
      visibleQuestionIds
        .map((questionId) => questionById.get(questionId))
        .filter((question): question is DemographicQuestion =>
          Boolean(question)
        ),
    [visibleQuestionIds, questionById]
  )
  const hiddenQuestions = useMemo(
    () => questions.filter((question) => !visibleQuestionSet.has(question.id)),
    [questions, visibleQuestionSet]
  )
  const answerQuestionFilterId = answerQuestionFilter
    ? Number(answerQuestionFilter)
    : null
  const excludedAnswerIds = useMemo(() => {
    if (!answerQuestionFilterId || !questionById.has(answerQuestionFilterId)) {
      return null
    }
    return new Set(
      uniqueOrderedIds(draftByQuestion[answerQuestionFilterId] ?? [])
    )
  }, [answerQuestionFilterId, draftByQuestion, questionById])
  const filteredAnswers = useMemo(() => {
    const query = deferredAnswerSearch.trim().toLocaleLowerCase()
    return answers.filter(
      (answer) =>
        !excludedAnswerIds?.has(answer.id) &&
        (!query || answer.answer.toLocaleLowerCase().includes(query))
    )
  }, [answers, deferredAnswerSearch, excludedAnswerIds])
  const selectedAvailableAnswerSet = useMemo(
    () => new Set(selectedAvailableAnswerIds),
    [selectedAvailableAnswerIds]
  )
  const changedQuestionIds = useMemo(
    () =>
      getChangedQuestionIds(
        questions,
        initialState.draftByQuestion,
        draftByQuestion
      ),
    [questions, initialState, draftByQuestion]
  )
  const operations = useMemo(
    () =>
      buildMappingApplyOperations(
        questions,
        mappings,
        draftByQuestion,
        changedQuestionIds
      ),
    [questions, mappings, draftByQuestion, changedQuestionIds]
  )
  const draftChangeCount = useMemo(
    () =>
      getDraftChangeCount(
        questions,
        initialState.draftByQuestion,
        draftByQuestion
      ),
    [questions, initialState, draftByQuestion]
  )
  const isDirty = draftChangeCount > 0
  const changeLabel =
    draftChangeCount === 1 ? '1 change' : `${draftChangeCount} changes`
  const activeAnswerTotal = visibleQuestionIds.reduce(
    (total, questionId) => total + (draftByQuestion[questionId]?.length ?? 0),
    0
  )

  useEffect(() => {
    setDraftByQuestion(initialState.draftByQuestion)
    setVisibleQuestionIds(initialState.visibleQuestionIds)
    setAnswerQuestionFilter('')
    setSelectedAvailableAnswerIds([])
    setQuestionToAdd('')
  }, [initialState])

  useEffect(() => {
    draftByQuestionRef.current = draftByQuestion
  }, [draftByQuestion])

  useEffect(() => {
    setPortalReady(true)
  }, [])

  useEffect(() => {
    const validAnswerIds = new Set(answers.map((answer) => answer.id))
    setSelectedAvailableAnswerIds((current) => {
      const next = current.filter((answerId) => validAnswerIds.has(answerId))
      return next.length === current.length ? current : next
    })
  }, [answers])

  useEffect(() => {
    if (!portalReady) return

    let animationFrame: number | null = null
    let trackingUntil = 0

    function schedulePanelFrame() {
      if (animationFrame !== null) return
      animationFrame = window.requestAnimationFrame(applyPanelFrame)
    }

    function keepTrackingDuringLayoutShift() {
      if (trackingUntil > window.performance.now()) {
        schedulePanelFrame()
      }
    }

    function trackPanelFrame(durationMs = ANSWER_PANEL_LAYOUT_TRACK_MS) {
      trackingUntil = Math.max(
        trackingUntil,
        window.performance.now() + durationMs
      )
      schedulePanelFrame()
    }

    function applyPanelFrame() {
      animationFrame = null
      const anchor = answerPanelAnchorRef.current
      const panel = fixedAnswerPanelRef.current
      const grid = mappingGridRef.current

      if (!anchor || !panel || !grid || window.innerWidth < 1024) {
        answerPanelFrameRef.current = null
        if (panel) panel.style.visibility = 'hidden'
        keepTrackingDuringLayoutShift()
        return
      }

      const anchorBounds = anchor.getBoundingClientRect()
      const gridBounds = grid.getBoundingClientRect()
      const top = Math.round(Math.max(anchorBounds.top, ANSWER_PANEL_TOP))
      const bottom = Math.round(
        Math.min(
          window.innerHeight - ANSWER_PANEL_GAP,
          gridBounds.bottom - ANSWER_PANEL_GAP
        )
      )
      const height = Math.max(0, bottom - top)

      if (height < ANSWER_PANEL_MIN_HEIGHT) {
        answerPanelFrameRef.current = null
        panel.style.visibility = 'hidden'
        keepTrackingDuringLayoutShift()
        return
      }

      const nextFrame = {
        left: Math.round(anchorBounds.left),
        top,
        width: Math.round(anchorBounds.width),
        height,
        visible: true,
      }
      const currentFrame = answerPanelFrameRef.current
      if (
        currentFrame &&
        currentFrame.left === nextFrame.left &&
        currentFrame.top === nextFrame.top &&
        currentFrame.width === nextFrame.width &&
        currentFrame.height === nextFrame.height &&
        currentFrame.visible
      ) {
        keepTrackingDuringLayoutShift()
        return
      }

      answerPanelFrameRef.current = nextFrame
      panel.style.visibility = 'visible'
      panel.style.transform = `translate3d(${nextFrame.left}px, ${nextFrame.top}px, 0)`
      panel.style.width = `${nextFrame.width}px`
      panel.style.height = `${nextFrame.height}px`
      keepTrackingDuringLayoutShift()
    }

    trackPanelFrame()
    const resizeObserver =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(schedulePanelFrame)
        : null
    if (answerPanelAnchorRef.current) {
      resizeObserver?.observe(answerPanelAnchorRef.current)
    }
    if (mappingGridRef.current) {
      resizeObserver?.observe(mappingGridRef.current)
    }
    const handleSidebarState = () => trackPanelFrame()
    window.addEventListener('scroll', schedulePanelFrame, { passive: true })
    window.addEventListener('resize', schedulePanelFrame)
    window.addEventListener('sidebar:state', handleSidebarState)

    return () => {
      if (animationFrame !== null) {
        window.cancelAnimationFrame(animationFrame)
      }
      resizeObserver?.disconnect()
      window.removeEventListener('scroll', schedulePanelFrame)
      window.removeEventListener('resize', schedulePanelFrame)
      window.removeEventListener('sidebar:state', handleSidebarState)
    }
  }, [portalReady])

  const resetDraft = () => {
    setDraftByQuestion(initialState.draftByQuestion)
    setVisibleQuestionIds(initialState.visibleQuestionIds)
    setAnswerQuestionFilter('')
    setSelectedAvailableAnswerIds([])
    setQuestionToAdd('')
  }

  const addQuestion = () => {
    const questionId = Number(questionToAdd)
    if (!questionById.has(questionId)) return
    setVisibleQuestionIds((current) =>
      current.includes(questionId) ? current : [...current, questionId]
    )
    setDraftByQuestion((current) => ({
      ...current,
      [questionId]:
        current[questionId] && current[questionId].length > 0
          ? current[questionId]
          : (initialState.draftByQuestion[questionId] ??
            inactiveAnswersByQuestion.get(questionId) ??
            []),
    }))
    setQuestionToAdd('')
  }

  const removeQuestion = (questionId: number) => {
    setVisibleQuestionIds((current) =>
      current.filter((currentQuestionId) => currentQuestionId !== questionId)
    )
    setDraftByQuestion((current) => ({ ...current, [questionId]: [] }))
  }

  const removeAnswer = (questionId: number, answerId: number) => {
    setDraftByQuestion((current) => ({
      ...current,
      [questionId]: (current[questionId] ?? []).filter(
        (currentAnswerId) => currentAnswerId !== answerId
      ),
    }))
  }

  const toggleAvailableAnswerSelection = (
    answerId: number,
    selected: boolean
  ) => {
    setSelectedAvailableAnswerIds((current) => {
      if (!selected) {
        return current.filter((currentAnswerId) => currentAnswerId !== answerId)
      }
      return current.includes(answerId) ? current : [...current, answerId]
    })
  }

  const getAvailableDragAnswerIds = (answerId: number) => {
    if (!selectedAvailableAnswerSet.has(answerId)) return [answerId]
    const selectedAnswerIds = uniqueOrderedIds(
      selectedAvailableAnswerIds
    ).filter((selectedAnswerId) => answerById.has(selectedAnswerId))
    return selectedAnswerIds.length ? selectedAnswerIds : [answerId]
  }

  const sortQuestionAnswers = (questionId: number) => {
    setDraftByQuestion((current) => {
      const currentAnswers = uniqueOrderedIds(current[questionId] ?? [])
      const sortedAnswers = [...currentAnswers].sort(
        (leftAnswerId, rightAnswerId) => {
          const leftAnswer = answerById.get(leftAnswerId)?.answer ?? ''
          const rightAnswer = answerById.get(rightAnswerId)?.answer ?? ''
          return (
            leftAnswer
              .toLocaleLowerCase()
              .localeCompare(rightAnswer.toLocaleLowerCase()) ||
            leftAnswerId - rightAnswerId
          )
        }
      )
      if (sameNumberArray(currentAnswers, sortedAnswers)) return current
      return { ...current, [questionId]: sortedAnswers }
    })
  }

  const placeDraftAnswer = useCallback(
    (payload: MappingDragPayload, questionId: number, insertIndex: number) => {
      const answerIds = uniqueOrderedIds(payload.answerIds).filter((answerId) =>
        answerById.has(answerId)
      )
      if (answerIds.length === 0) return
      setVisibleQuestionIds((current) =>
        current.includes(questionId) ? current : [...current, questionId]
      )
      setDraftByQuestion((current) => {
        return buildDraftWithPlacedAnswers(
          current,
          { ...payload, answerIds },
          questionId,
          insertIndex
        )
      })
    },
    [answerById]
  )

  const resolveDragTarget = useCallback((clientX: number, clientY: number) => {
    const target = document.elementFromPoint(clientX, clientY)
    const questionElement = target?.closest<HTMLElement>(
      '[data-mapping-question-id]'
    )
    if (!questionElement) {
      return null
    }

    const questionId = Number(questionElement.dataset.mappingQuestionId)
    if (!Number.isInteger(questionId)) return null

    const itemElement = target?.closest<HTMLElement>(
      '[data-mapping-answer-row]'
    )
    const baseAnswers = uniqueOrderedIds(
      draftByQuestionRef.current[questionId] ?? []
    )
    let insertIndex = baseAnswers.length

    if (itemElement && questionElement.contains(itemElement)) {
      const hoveredAnswerId = Number(itemElement.dataset.mappingAnswerId)
      const itemIndex = baseAnswers.indexOf(hoveredAnswerId)
      if (itemIndex >= 0) {
        const bounds = itemElement.getBoundingClientRect()
        insertIndex =
          itemIndex + (clientY > bounds.top + bounds.height / 2 ? 1 : 0)
      } else if (dropTargetRef.current?.questionId === questionId) {
        insertIndex = dropTargetRef.current.insertIndex
      }
    }

    return { questionId, insertIndex }
  }, [])

  const updateDragTarget = useCallback(
    (clientX: number, clientY: number) => {
      const target = resolveDragTarget(clientX, clientY)
      dropTargetRef.current = target
      if (!target) {
        setDragOverQuestionId(null)
        return
      }

      setDragOverQuestionId((current) =>
        current === target.questionId ? current : target.questionId
      )
    },
    [resolveDragTarget]
  )

  const clearDragState = useCallback(() => {
    activeDragRef.current = null
    dropTargetRef.current = null
    setActiveDrag(null)
    setDragOverQuestionId(null)
  }, [])

  const commitDragTarget = useCallback(
    (clientX: number, clientY: number, payload: MappingDragPayload) => {
      const target = resolveDragTarget(clientX, clientY)
      if (!target) return
      placeDraftAnswer(payload, target.questionId, target.insertIndex)
    },
    [placeDraftAnswer, resolveDragTarget]
  )

  const scrollDuringDrag = useCallback((clientX: number, clientY: number) => {
    const target = document.elementFromPoint(clientX, clientY)
    const scrollZone = target?.closest<HTMLElement>(
      '[data-mapping-scroll-zone]'
    )
    const edgeSize = 56
    const scrollStep = 18

    if (scrollZone) {
      const bounds = scrollZone.getBoundingClientRect()
      if (clientY < bounds.top + edgeSize) {
        scrollZone.scrollBy({ top: -scrollStep })
      } else if (clientY > bounds.bottom - edgeSize) {
        scrollZone.scrollBy({ top: scrollStep })
      }
    }

    if (clientY < edgeSize) {
      window.scrollBy({ top: -scrollStep })
    } else if (clientY > window.innerHeight - edgeSize) {
      window.scrollBy({ top: scrollStep })
    }
  }, [])

  const startAnswerDrag = (
    event: React.PointerEvent<HTMLElement>,
    payload: MappingDragPayload
  ) => {
    if (event.button !== 0) return
    const answerIds = uniqueOrderedIds(payload.answerIds).filter((answerId) =>
      answerById.has(answerId)
    )
    if (answerIds.length === 0) return
    const answer = answerById.get(answerIds[0])
    if (!answer) return
    const bounds = event.currentTarget.getBoundingClientRect()
    const drag: ActiveMappingDrag = {
      ...payload,
      answerIds,
      label:
        answerIds.length === 1
          ? answer.answer
          : `${answer.answer} + ${answerIds.length - 1} more`,
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      grabOffsetX: event.clientX - bounds.left,
      grabOffsetY: event.clientY - bounds.top,
      width: Math.min(bounds.width, 420),
    }
    event.preventDefault()
    activeDragRef.current = drag
    setActiveDrag(drag)
  }

  useEffect(() => {
    if (!activeDrag) return
    const previousUserSelect = document.body.style.userSelect
    const previousCursor = document.body.style.cursor
    document.body.style.userSelect = 'none'
    document.body.style.cursor = 'grabbing'

    const handlePointerMove = (event: PointerEvent) => {
      const current = activeDragRef.current
      if (!current || event.pointerId !== current.pointerId) return
      event.preventDefault()
      const next = { ...current, x: event.clientX, y: event.clientY }
      activeDragRef.current = next
      setActiveDrag(next)
      scrollDuringDrag(event.clientX, event.clientY)
      updateDragTarget(event.clientX, event.clientY)
    }

    const stopDrag = (event: PointerEvent) => {
      const current = activeDragRef.current
      if (current && event.pointerId !== current.pointerId) return
      if (current && event.type === 'pointerup') {
        commitDragTarget(event.clientX, event.clientY, current)
      }
      clearDragState()
    }

    window.addEventListener('pointermove', handlePointerMove, {
      passive: false,
    })
    window.addEventListener('pointerup', stopDrag)
    window.addEventListener('pointercancel', stopDrag)

    return () => {
      document.body.style.userSelect = previousUserSelect
      document.body.style.cursor = previousCursor
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', stopDrag)
      window.removeEventListener('pointercancel', stopDrag)
    }
  }, [
    activeDrag?.pointerId,
    clearDragState,
    commitDragTarget,
    scrollDuringDrag,
    updateDragTarget,
  ])

  const applyChanges = async () => {
    if (!isDirty || applying) return
    setApplying(true)
    try {
      if (operations.updates.length) {
        await DemographicsService.updateMappings(operations.updates)
      }
      if (operations.creates.length) {
        await DemographicsService.createMappings(operations.creates)
      }
      toast({
        title: 'Mapping changes applied',
        description: `${changeLabel} applied.`,
      })
      await onReload()
    } catch (error) {
      toast({
        title: 'Apply failed',
        description: errorMessage(error),
        variant: 'destructive',
      })
    } finally {
      setApplying(false)
    }
  }

  const renderAnswerPanel = () => (
    <div className="space-y-3 lg:flex lg:h-full lg:min-h-0 lg:flex-col">
      <div className="space-y-2">
        <div className="flex h-7 items-center justify-between gap-2">
          <Label>Available answers</Label>
          <div
            className={cn(
              'flex items-center gap-2 text-xs text-muted-foreground transition-opacity',
              selectedAvailableAnswerIds.length === 0 &&
                'invisible pointer-events-none opacity-0'
            )}
          >
            <span>
              {selectedAvailableAnswerIds.length}{' '}
              {selectedAvailableAnswerIds.length === 1
                ? 'answer selected'
                : 'answers selected'}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setSelectedAvailableAnswerIds([])}
              disabled={selectedAvailableAnswerIds.length === 0}
              tabIndex={selectedAvailableAnswerIds.length > 0 ? 0 : -1}
              className="h-7 gap-1 px-2 text-xs"
            >
              <X className="h-3.5 w-3.5" />
              Clear
            </Button>
          </div>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={answerSearch}
            onChange={(event) => setAnswerSearch(event.target.value)}
            placeholder="Search answers"
            className="pl-9"
          />
        </div>
        <div className="space-y-2">
          <Label>Not in question</Label>
          <NativeSelect
            value={answerQuestionFilter}
            onChange={setAnswerQuestionFilter}
            options={[
              { value: '', label: 'All answers' },
              ...questions.map((question) => ({
                value: String(question.id),
                label: question.question,
              })),
            ]}
          />
        </div>
      </div>

      <div
        className="max-h-[32rem] overflow-y-auto rounded-md border bg-background p-2 lg:min-h-0 lg:flex-1 lg:max-h-none"
        data-mapping-scroll-zone
      >
        {loading ? (
          <div className="p-3 text-sm text-muted-foreground">Loading...</div>
        ) : filteredAnswers.length === 0 ? (
          <div className="p-3 text-sm text-muted-foreground">
            No answers found.
          </div>
        ) : (
          <div className="space-y-2">
            {filteredAnswers.map((answer) => {
              const selected = selectedAvailableAnswerSet.has(answer.id)
              return (
                <div
                  key={answer.id}
                  role="checkbox"
                  aria-checked={selected}
                  tabIndex={0}
                  onClick={() =>
                    toggleAvailableAnswerSelection(answer.id, !selected)
                  }
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter' && event.key !== ' ') return
                    event.preventDefault()
                    toggleAvailableAnswerSelection(answer.id, !selected)
                  }}
                  title="Click to select. Drag from the grip."
                  className={cn(
                    'flex min-h-11 w-full cursor-pointer select-none items-center gap-2 rounded-md border bg-card px-3 py-2 text-left text-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
                    selected && 'border-primary/50 bg-primary/5',
                    activeDrag?.fromQuestionId === null &&
                      activeDrag.answerIds.includes(answer.id) &&
                      'opacity-50'
                  )}
                >
                  <Checkbox
                    checked={selected}
                    tabIndex={-1}
                    aria-hidden="true"
                    className="pointer-events-none h-5 w-5"
                  />
                  <button
                    type="button"
                    onPointerDown={(event) => {
                      event.stopPropagation()
                      startAnswerDrag(event, {
                        answerIds: getAvailableDragAnswerIds(answer.id),
                        fromQuestionId: null,
                      })
                    }}
                    onClick={(event) => event.stopPropagation()}
                    aria-label={`Drag ${answer.answer}`}
                    className="flex h-8 w-8 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted active:cursor-grabbing"
                  >
                    <GripVertical className="h-4 w-4" />
                  </button>
                  <span className="min-w-0 flex-1 truncate">
                    {answer.answer}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )

  return (
    <div className="page-shell">
      <div className="page-header">
        <h1 className="page-title">{copy.title}</h1>
        <p className="page-subtitle">{copy.subtitle}</p>
      </div>

      <div className="rounded-lg border border-border/70 bg-card/85 text-card-foreground shadow-sm backdrop-blur">
        <div className="space-y-4 p-4">
          <div className="flex flex-col gap-3 rounded-md border bg-muted/40 p-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={isDirty ? 'default' : 'secondary'}>
                {isDirty ? `Unsaved: ${changeLabel}` : 'Up to date: 0 changes'}
              </Badge>
              <span className="text-sm text-muted-foreground">
                {visibleQuestions.length} questions / {activeAnswerTotal}{' '}
                answers
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={resetDraft}
                disabled={!isDirty || applying}
                className="gap-2"
              >
                <RotateCcw className="h-4 w-4" />
                Reset
              </Button>
              <Button
                onClick={() => void applyChanges()}
                disabled={!isDirty || applying}
                className="gap-2"
              >
                <Save className="h-4 w-4" />
                {applying ? 'Applying...' : 'Apply changes'}
              </Button>
            </div>
          </div>

          <div
            ref={mappingGridRef}
            className="grid gap-4 lg:grid-cols-[minmax(16rem,24rem)_minmax(0,1fr)]"
          >
            <aside ref={answerPanelAnchorRef} className="lg:self-stretch">
              <div className="lg:hidden">{renderAnswerPanel()}</div>
              <div className="hidden lg:block lg:h-[calc(100vh-88px)]" />
            </aside>

            <div className="space-y-3">
              <div className="flex flex-col gap-2 rounded-md border bg-muted/95 p-3 backdrop-blur sm:flex-row sm:items-end">
                <div className="min-w-0 flex-1 space-y-2">
                  <Label>Add question</Label>
                  <NativeSelect
                    value={questionToAdd}
                    onChange={setQuestionToAdd}
                    options={[
                      {
                        value: '',
                        label: hiddenQuestions.length
                          ? 'Select a question'
                          : 'No hidden questions',
                      },
                      ...hiddenQuestions.map((question) => ({
                        value: String(question.id),
                        label: question.question,
                      })),
                    ]}
                    className="min-w-0"
                  />
                </div>
                <Button
                  variant="outline"
                  onClick={addQuestion}
                  disabled={!questionToAdd}
                  className="gap-2"
                >
                  <Plus className="h-4 w-4" />
                  Add question
                </Button>
              </div>

              {loading ? (
                <div className="rounded-md border bg-background p-4 text-sm text-muted-foreground">
                  Loading...
                </div>
              ) : visibleQuestions.length === 0 ? (
                <div className="rounded-md border bg-background p-4 text-sm text-muted-foreground">
                  No active question sections.
                </div>
              ) : (
                visibleQuestions.map((question) => {
                  const answerIds = draftByQuestion[question.id] ?? []
                  return (
                    <section
                      key={question.id}
                      data-mapping-question-id={question.id}
                      className={cn(
                        'overflow-hidden rounded-md border bg-background transition-shadow',
                        dragOverQuestionId === question.id &&
                          'ring-2 ring-primary/40'
                      )}
                    >
                      <div className="flex flex-col gap-2 border-b bg-muted/30 p-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <h2 className="text-sm font-semibold leading-5">
                            {question.question}
                          </h2>
                          <div className="text-xs text-muted-foreground">
                            {answerIds.length}{' '}
                            {answerIds.length === 1 ? 'answer' : 'answers'}
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => sortQuestionAnswers(question.id)}
                            disabled={answerIds.length < 2}
                            className="gap-2"
                          >
                            <ArrowUpAZ className="h-4 w-4" />
                            Sort A-Z
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => removeQuestion(question.id)}
                            className="gap-2"
                          >
                            <Trash2 className="h-4 w-4" />
                            Remove
                          </Button>
                        </div>
                      </div>

                      <div
                        className="max-h-96 overflow-y-auto p-2"
                        data-mapping-scroll-zone
                        data-mapping-question-id={question.id}
                      >
                        {answerIds.length === 0 ? (
                          <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                            No active answers.
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {answerIds.map((answerId, index) => {
                              const answer = answerById.get(answerId)
                              if (!answer) return null
                              return (
                                <div
                                  key={answerId}
                                  data-mapping-answer-row
                                  data-mapping-answer-index={index}
                                  data-mapping-answer-id={answerId}
                                  onPointerDown={(event) =>
                                    startAnswerDrag(event, {
                                      answerIds: [answerId],
                                      fromQuestionId: question.id,
                                    })
                                  }
                                  className={cn(
                                    'group flex min-h-11 cursor-grab touch-none items-center gap-2 rounded-md border bg-card px-2 py-2 text-sm transition-all duration-150 hover:bg-muted active:cursor-grabbing',
                                    activeDrag?.answerIds.includes(answerId) &&
                                      activeDrag.fromQuestionId ===
                                        question.id &&
                                      'scale-[0.99] opacity-40'
                                  )}
                                >
                                  <span className="flex h-7 min-w-10 shrink-0 items-center justify-center rounded border bg-muted px-2 text-xs text-muted-foreground">
                                    {index + 1}
                                  </span>
                                  <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground" />
                                  <span className="min-w-0 flex-1 truncate">
                                    {answer.answer}
                                  </span>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onPointerDown={(event) =>
                                      event.stopPropagation()
                                    }
                                    onClick={() =>
                                      removeAnswer(question.id, answerId)
                                    }
                                    aria-label={`Remove ${answer.answer}`}
                                    className="h-8 w-8 shrink-0"
                                  >
                                    <X className="h-4 w-4" />
                                  </Button>
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    </section>
                  )
                })
              )}
            </div>
          </div>
        </div>
      </div>
      {portalReady
        ? createPortal(
            <div
              ref={fixedAnswerPanelRef}
              className="fixed left-0 top-0 z-30 hidden overflow-hidden lg:block"
              style={{
                height: 0,
                transform: 'translate3d(0, 0, 0)',
                visibility: 'hidden',
                width: 0,
                willChange: 'transform, height',
              }}
            >
              {renderAnswerPanel()}
            </div>,
            document.body
          )
        : null}
      {portalReady && activeDrag
        ? createPortal(
            <div
              className="pointer-events-none fixed z-[70] flex min-h-11 items-center gap-2 rounded-md border bg-card px-3 py-2 text-sm text-card-foreground opacity-95 shadow-xl"
              style={{
                left: activeDrag.x - activeDrag.grabOffsetX,
                top: activeDrag.y - activeDrag.grabOffsetY,
                maxWidth: 'calc(100vw - 2rem)',
                width: activeDrag.width,
              }}
            >
              <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">
                {activeDrag.label}
              </span>
              {activeDrag.answerIds.length > 1 ? (
                <span className="rounded border bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                  {activeDrag.answerIds.length}
                </span>
              ) : null}
            </div>,
            document.body
          )
        : null}
    </div>
  )
}

function buildInitialMappingState(
  questions: DemographicQuestion[],
  answers: DemographicAnswer[],
  mappings: DemographicMapping[]
) {
  const validQuestionIds = new Set(questions.map((question) => question.id))
  const draftByQuestion: MappingDraft = {}
  orderedMappings(mappings, answers)
    .filter(
      (mapping) =>
        !mapping.is_deleted && validQuestionIds.has(mapping.question_id)
    )
    .forEach((mapping) => {
      const current = draftByQuestion[mapping.question_id] ?? []
      if (!current.includes(mapping.answer_id)) current.push(mapping.answer_id)
      draftByQuestion[mapping.question_id] = current
    })

  return {
    draftByQuestion,
    visibleQuestionIds: questions
      .map((question) => question.id)
      .filter((questionId) => (draftByQuestion[questionId]?.length ?? 0) > 0),
  }
}

function buildInactiveAnswersByQuestion(
  answers: DemographicAnswer[],
  mappings: DemographicMapping[]
) {
  const answersByQuestion = new Map<number, number[]>()
  orderedMappings(mappings, answers)
    .filter((mapping) => mapping.is_deleted)
    .forEach((mapping) => {
      const current = answersByQuestion.get(mapping.question_id) ?? []
      if (!current.includes(mapping.answer_id)) current.push(mapping.answer_id)
      answersByQuestion.set(mapping.question_id, current)
    })
  return answersByQuestion
}

function buildMappingApplyOperations(
  questions: DemographicQuestion[],
  mappings: DemographicMapping[],
  draftByQuestion: MappingDraft,
  changedQuestionIds: Set<number>
) {
  if (changedQuestionIds.size === 0) return { creates: [], updates: [] }

  const validQuestionIds = new Set(questions.map((question) => question.id))
  const desiredMappings = new Map<
    string,
    { questionId: number; answerId: number; displayOrder: number }
  >()

  Object.entries(draftByQuestion).forEach(([questionIdValue, answerIds]) => {
    const questionId = Number(questionIdValue)
    if (
      !validQuestionIds.has(questionId) ||
      !changedQuestionIds.has(questionId)
    )
      return
    uniqueOrderedIds(answerIds).forEach((answerId, displayOrder) => {
      desiredMappings.set(mappingKey(questionId, answerId), {
        questionId,
        answerId,
        displayOrder,
      })
    })
  })

  const existingByQuestionAnswer = new Map<string, DemographicMapping>()
  orderedMappings(mappings).forEach((mapping) => {
    if (
      !validQuestionIds.has(mapping.question_id) ||
      !changedQuestionIds.has(mapping.question_id)
    )
      return
    const key = mappingKey(mapping.question_id, mapping.answer_id)
    const existing = existingByQuestionAnswer.get(key)
    if (!existing || (existing.is_deleted && !mapping.is_deleted)) {
      existingByQuestionAnswer.set(key, mapping)
    }
  })

  const updates: MappingUpdate[] = []
  const creates: MappingCreate[] = []

  desiredMappings.forEach((desired, key) => {
    const existing = existingByQuestionAnswer.get(key)
    if (!existing) {
      creates.push({
        question_id: desired.questionId,
        answer_id: desired.answerId,
        display_order: desired.displayOrder,
        is_deleted: false,
      })
      return
    }
    if (
      existing.is_deleted ||
      existing.display_order !== desired.displayOrder
    ) {
      updates.push({
        id: existing.id,
        question_id: desired.questionId,
        answer_id: desired.answerId,
        display_order: desired.displayOrder,
        is_deleted: false,
      })
    }
  })

  mappings.forEach((mapping) => {
    if (
      mapping.is_deleted ||
      !validQuestionIds.has(mapping.question_id) ||
      !changedQuestionIds.has(mapping.question_id) ||
      desiredMappings.has(mappingKey(mapping.question_id, mapping.answer_id))
    ) {
      return
    }
    updates.push({
      id: mapping.id,
      question_id: mapping.question_id,
      answer_id: mapping.answer_id,
      display_order: mapping.display_order,
      is_deleted: true,
    })
  })

  return { creates, updates }
}

function getChangedQuestionIds(
  questions: DemographicQuestion[],
  initialDraftByQuestion: MappingDraft,
  draftByQuestion: MappingDraft
) {
  const changedQuestionIds = new Set<number>()
  questions.forEach((question) => {
    const initialAnswers = uniqueOrderedIds(
      initialDraftByQuestion[question.id] ?? []
    )
    const draftAnswers = uniqueOrderedIds(draftByQuestion[question.id] ?? [])
    if (!sameNumberArray(initialAnswers, draftAnswers)) {
      changedQuestionIds.add(question.id)
    }
  })
  return changedQuestionIds
}

function getDraftChangeCount(
  questions: DemographicQuestion[],
  initialDraftByQuestion: MappingDraft,
  draftByQuestion: MappingDraft
) {
  return questions.reduce((total, question) => {
    const initialAnswers = uniqueOrderedIds(
      initialDraftByQuestion[question.id] ?? []
    )
    const draftAnswers = uniqueOrderedIds(draftByQuestion[question.id] ?? [])
    const initialAnswerSet = new Set(initialAnswers)
    const draftAnswerSet = new Set(draftAnswers)
    const addedCount = draftAnswers.filter(
      (answerId) => !initialAnswerSet.has(answerId)
    ).length
    const removedCount = initialAnswers.filter(
      (answerId) => !draftAnswerSet.has(answerId)
    ).length

    if (addedCount || removedCount) {
      return total + addedCount + removedCount
    }

    return sameNumberArray(initialAnswers, draftAnswers) ? total : total + 1
  }, 0)
}

function orderedMappings(
  mappings: DemographicMapping[],
  answers: DemographicAnswer[] = []
) {
  const answerLabelById = new Map(
    answers.map((answer) => [answer.id, answer.answer])
  )
  return [...mappings].sort((left, right) => {
    const answerCompare = (answerLabelById.get(left.answer_id) ?? '')
      .toLocaleLowerCase()
      .localeCompare(
        (answerLabelById.get(right.answer_id) ?? '').toLocaleLowerCase()
      )
    return (
      left.question_id - right.question_id ||
      left.display_order - right.display_order ||
      answerCompare ||
      left.id - right.id
    )
  })
}

function buildDraftWithPlacedAnswers(
  current: MappingDraft,
  payload: MappingDragPayload,
  questionId: number,
  insertIndex: number
) {
  const payloadAnswerIds = uniqueOrderedIds(payload.answerIds)
  if (payloadAnswerIds.length === 0) return current
  const payloadAnswerSet = new Set(payloadAnswerIds)
  const currentAnswers = uniqueOrderedIds(current[questionId] ?? [])
  const nextAnswers = currentAnswers.filter(
    (answerId) => !payloadAnswerSet.has(answerId)
  )
  const removedBeforeInsert = currentAnswers
    .slice(0, insertIndex)
    .filter((answerId) => payloadAnswerSet.has(answerId)).length
  const nextIndex = Math.max(
    0,
    Math.min(insertIndex - removedBeforeInsert, nextAnswers.length)
  )
  nextAnswers.splice(nextIndex, 0, ...payloadAnswerIds)
  if (sameNumberArray(currentAnswers, nextAnswers)) return current
  return { ...current, [questionId]: nextAnswers }
}

function uniqueOrderedIds(ids: number[]) {
  return ids.filter((id, index, values) => values.indexOf(id) === index)
}

function sameNumberArray(left: number[], right: number[]) {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  )
}

function mappingKey(questionId: number, answerId: number) {
  return `${questionId}:${answerId}`
}

type FormState = typeof emptyForm
function RecordFields({
  kind,
  form,
  setForm,
  questions,
  answers,
  mappings,
  profiles,
  profileLabel,
  mappingLabel,
}: {
  kind: DemographicsPageKind
  form: FormState
  setForm: React.Dispatch<React.SetStateAction<FormState>>
  questions: DemographicQuestion[]
  answers: DemographicAnswer[]
  mappings: DemographicMapping[]
  profiles: DemographicProfile[]
  profileLabel: (id: string) => string
  mappingLabel: (id: number) => string
}) {
  return (
    <div className="space-y-4">
      {kind === 'questions' && (
        <Field label="Question">
          <Input
            autoFocus
            value={form.question}
            onChange={(e) =>
              setForm((value) => ({ ...value, question: e.target.value }))
            }
          />
        </Field>
      )}
      {kind === 'answers' && (
        <Field label="Answer">
          <Input
            autoFocus
            value={form.answer}
            onChange={(e) =>
              setForm((value) => ({ ...value, answer: e.target.value }))
            }
          />
        </Field>
      )}
      {kind === 'mappings' && (
        <>
          <Field label="Question">
            <NativeSelect
              autoFocus
              value={form.questionId}
              onChange={(questionId) =>
                setForm((value) => ({ ...value, questionId }))
              }
              options={questions.map((item) => ({
                value: String(item.id),
                label: `${item.id} — ${item.question}`,
              }))}
            />
          </Field>
          <Field label="Answer">
            <NativeSelect
              value={form.answerId}
              onChange={(answerId) =>
                setForm((value) => ({ ...value, answerId }))
              }
              options={answers.map((item) => ({
                value: String(item.id),
                label: `${item.id} — ${item.answer}`,
              }))}
            />
          </Field>
          <Field label="Display order">
            <Input
              type="number"
              value={form.displayOrder}
              onChange={(e) =>
                setForm((value) => ({ ...value, displayOrder: e.target.value }))
              }
            />
          </Field>
          <div className="flex items-center gap-2">
            <Checkbox
              id="is-deleted"
              checked={form.isDeleted}
              onCheckedChange={(checked) =>
                setForm((value) => ({ ...value, isDeleted: checked === true }))
              }
            />
            <Label htmlFor="is-deleted">Marked as deleted</Label>
          </div>
        </>
      )}
      {kind === 'responses' && (
        <>
          <Field label="User">
            <UserSearchSelect
              value={form.userId}
              onChange={(userId) => setForm((value) => ({ ...value, userId }))}
              profiles={profiles}
              profileLabel={profileLabel}
            />
          </Field>
          <Field label="Question and answer">
            <NativeSelect
              value={form.mappingId}
              onChange={(mappingId) =>
                setForm((value) => ({ ...value, mappingId }))
              }
              options={mappings.map((item) => ({
                value: String(item.id),
                label: `${item.id} — ${mappingLabel(item.id)}`,
              }))}
            />
          </Field>
        </>
      )}
    </div>
  )
}

function UserSearchSelect({
  value,
  onChange,
  profiles,
  profileLabel,
}: {
  value: string
  onChange: (value: string) => void
  profiles: DemographicProfile[]
  profileLabel: (id: string) => string
}) {
  const [open, setOpen] = useState(false)
  const selected = profiles.find((profile) => profile.id === value)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
          autoFocus
        >
          <span className="truncate">
            {selected ? profileLabel(selected.id) : 'Search for a user…'}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[var(--radix-popover-trigger-width)] p-0"
        align="start"
      >
        <Command>
          <CommandInput placeholder="Search name, email, or user ID…" />
          <CommandList>
            <CommandEmpty>No user found.</CommandEmpty>
            <CommandGroup>
              {profiles.map((profile) => {
                const name = [profile.first_name, profile.last_name]
                  .filter(Boolean)
                  .join(' ')
                return (
                  <CommandItem
                    key={profile.id}
                    value={`${name} ${profile.email ?? ''} ${profile.id}`}
                    onSelect={() => {
                      onChange(profile.id)
                      setOpen(false)
                    }}
                  >
                    <Check
                      className={cn(
                        'h-4 w-4',
                        value === profile.id ? 'opacity-100' : 'opacity-0'
                      )}
                    />
                    <div className="min-w-0">
                      <div className="truncate font-medium">
                        {name || profile.email || 'Unnamed user'}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        {[profile.email, profile.id]
                          .filter(Boolean)
                          .join(' · ')}
                      </div>
                    </div>
                  </CommandItem>
                )
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  )
}
function NativeSelect({
  value,
  onChange,
  options,
  className = '',
  autoFocus = false,
}: {
  value: string
  onChange: (value: string) => void
  options: { value: string; label: string }[]
  className?: string
  autoFocus?: boolean
}) {
  return (
    <select
      autoFocus={autoFocus}
      className={`h-10 w-full rounded-md border border-input bg-background px-3 text-sm ${className}`}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  )
}
function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message
  if (error && typeof error === 'object') {
    const value = error as Record<string, unknown>
    const message = typeof value.message === 'string' ? value.message : ''
    const details = typeof value.details === 'string' ? value.details : ''
    const hint = typeof value.hint === 'string' ? value.hint : ''
    const code = typeof value.code === 'string' ? value.code : ''
    const parts = [message, details, hint].filter(
      (part, index, items) => part && items.indexOf(part) === index
    )
    if (parts.length) return `${parts.join(' ')}${code ? ` (${code})` : ''}`
  }
  return 'An unknown database error occurred. Check the browser console for details.'
}
function formatUtc(value: string | null) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return `${date
    .toISOString()
    .replace('T', ' ')
    .replace(/\.\d{3}Z$/, '')} UTC`
}
function splitRow(line: string) {
  return line.split(line.includes('\t') ? '\t' : ',').map((cell) => cell.trim())
}
function positiveInteger(value: string, label: string) {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0)
    throw new Error(`${label} must be a positive integer.`)
  return parsed
}
function mappingValues(
  questionId: string,
  answerId: string,
  displayOrder: string,
  isDeleted: boolean
) {
  const order = Number(displayOrder)
  if (!Number.isInteger(order) || order < 0)
    throw new Error('Display order must be a non-negative integer.')
  return {
    question_id: positiveInteger(questionId, 'Question Id'),
    answer_id: positiveInteger(answerId, 'Answer Id'),
    display_order: order,
    is_deleted: isDeleted,
  }
}
function parseBoolean(value: string | undefined, line: number) {
  if (!value) return false
  if (['true', 'yes', '1'].includes(value.toLowerCase())) return true
  if (['false', 'no', '0'].includes(value.toLowerCase())) return false
  throw new Error(`Line ${line}: is_deleted must be true or false.`)
}
