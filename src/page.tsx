'use client'

import { useEffect, useState, useRef, useMemo } from 'react'
import {
  Building2,
  Plus,
  Trash2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
  Printer,
  BarChart3,
  DollarSign,
  PieChart,
  FileUp,
  TrendingUp,
  Users,
  Bell,
  LogOut,
  Eye,
  ShieldCheck,
  Send,
  UserPlus,
  X,
  Loader2,
  Download,
  AlertCircle,
  CheckCircle2,
  Info,
  Search,
  Save,
  Clock,
  RefreshCw,
  History,
} from 'lucide-react'
import { SessionProvider, useSession, signOut } from 'next-auth/react'
import { toast } from 'sonner'
import { useAppStore, type DREData, type CompanyShareInfo, type SuggestedChangeInfo, type PendingInvitation } from '@/lib/store'
import { calcDRE, MONTHS, DRE_FIELD_LABELS, brlAccounting } from '@/lib/dre-utils'
import { useAutoSave } from '@/lib/use-auto-save'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import LoginScreen from '@/components/login-screen'
import DREMonthlyTab from '@/components/dre-monthly-tab'
import QualificationTab from '@/components/qualification-tab'
import ProjectionTab from '@/components/projection-tab'
import ChartsTab from '@/components/charts-tab'

// ─── Auth Provider Wrapper ───
function AuthProvider({ children }: { children: React.ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>
}

// RF-12: Hydration guard component - prevents flash of default state
function HydrationGuard({ children }: { children: React.ReactNode }) {
  const hydrated = useAppStore(s => s._hydrated)
  if (!hydrated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }
  return <>{children}</>
}

// ─── Main App Content ───
function AppContent() {
  const { data: session, status } = useSession()
  const userId = (session?.user as any)?.id

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!session) {
    return <LoginScreen />
  }

  return <HydrationGuard><DREApp session={session} userId={userId} /></HydrationGuard>
}

// ─── DRE App ───
function DREApp({ session, userId }: { session: any; userId: string }) {
  const {
    companies, setCompanies, selectedCompanyId, setSelectedCompany,
    selectedMonth, selectedYear, setSelectedMonth, setSelectedYear,
    dreData, setDREData, resetDREData,
    expenseItems, setExpenseItems, uploadedFiles, setUploadedFiles,
    projectionData, setProjectionData, projectionPeriod, setProjectionPeriod,
    activeTab, setActiveTab,
    companyAccess, setCompanyAccess,
    shares, setShares,
    pendingInvitations, setPendingInvitations,
    suggestedChanges, setSuggestedChanges,
    pendingChangesCount, setPendingChangesCount,
    customFields, setCustomFields,
    customFieldValues, setCustomFieldValues,
  } = useAppStore()

  // New state for sharing, suggestions, invitations
  const [shareDialogOpen, setShareDialogOpen] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [invitingShare, setInvitingShare] = useState(false)
  const [invitationsDialogOpen, setInvitationsDialogOpen] = useState(false)
  const [suggestedFields, setSuggestedFields] = useState<Set<string>>(new Set())
  const [changesDialogOpen, setChangesDialogOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  // RF-04: Parser feedback state
  const [distributedMonths, setDistributedMonths] = useState<string[]>([])
  const [autoClassified, setAutoClassified] = useState(0)

  // Existing state
  const [companyDialogOpen, setCompanyDialogOpen] = useState(false)
  const [newCompanyName, setNewCompanyName] = useState('')
  const [newCompanyCnpj, setNewCompanyCnpj] = useState('')
  const [cnpjValidating, setCnpjValidating] = useState(false)
  const [cnpjValid, setCnpjValid] = useState<boolean | null>(null)
  const [cnpjMessage, setCnpjMessage] = useState('')
  const [cnpjCreating, setCnpjCreating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(false)
  const [projecting, setProjecting] = useState(false)
  const [projectionResult, setProjectionResult] = useState<any>(null)
  const [expandedProjectionIdx, setExpandedProjectionIdx] = useState<number | null>(null)
  const [expenseUploading, setExpenseUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadFileName, setUploadFileName] = useState('')
  const [applying, setApplying] = useState(false)
  // RNF-01: Debounced save for DRE field changes
  const dreSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Auto-save timer for periodic DRE saves (every 30s)
  const autoSaveTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleteSaveDialogOpen, setDeleteSaveDialogOpen] = useState(false)
  const [deletingCompanyId, setDeletingCompanyId] = useState<string | null>(null)
  const [deletingCompanyName, setDeletingCompanyName] = useState('')
  const [allHistory, setAllHistory] = useState<any[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Custom field inline form state
  const [addingCustomField, setAddingCustomField] = useState<string | null>(null)
  const [newCustomFieldName, setNewCustomFieldName] = useState('')
  const [newCustomFieldSign, setNewCustomFieldSign] = useState('+')
  const [addingCustomLoading, setAddingCustomLoading] = useState(false)

  // DRE entry ID for custom values
  const [dreEntryId, setDreEntryId] = useState<string | null>(null)

  const isOwner = selectedCompanyId ? companyAccess[selectedCompanyId] === 'owner' : true
  const isViewer = selectedCompanyId ? companyAccess[selectedCompanyId] === 'viewer' : false

  // ─── Last saved indicator ───
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null)

  // ─── Auto Save (periodic every 30s + 20min inactivity sign-out) ───
  // The periodic auto-save silently saves DRE data every 30 seconds
  // to prevent data loss. The inactivity sign-out remains from useAutoSave.
  const handleSaveDREFn = async () => { await handleSaveDREInternal(false) }
  useAutoSave({ selectedCompanyId, handleSaveDRE: handleSaveDREFn })

  // Periodic auto-save: every 30 seconds, silently save DRE data
  useEffect(() => {
    if (!selectedCompanyId || !isOwner) {
      if (autoSaveTimerRef.current) {
        clearInterval(autoSaveTimerRef.current)
        autoSaveTimerRef.current = null
      }
      return
    }
    autoSaveTimerRef.current = setInterval(async () => {
      try {
        const res = await fetch('/api/dre', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ companyId: selectedCompanyId, month: selectedMonth, year: selectedYear, ...useAppStore.getState().dreData }),
        })
        if (res.ok) {
          const savedData = await res.json()
          if (savedData?.id) {
            setDreEntryId(savedData.id)
          }
          setLastSavedAt(new Date().toLocaleTimeString('pt-BR'))
        }
      } catch {
        // Silent — auto-save is best-effort
      }
    }, 30000) // every 30 seconds
    return () => {
      if (autoSaveTimerRef.current) {
        clearInterval(autoSaveTimerRef.current)
        autoSaveTimerRef.current = null
      }
    }
  }, [selectedCompanyId, selectedMonth, selectedYear, isOwner])

  // ─── Load pending invitations ───
  const loadPendingInvitations = async () => {
    try {
      const res = await fetch('/api/auth/invitations')
      if (res.ok) {
        const data = await res.json()
        setPendingInvitations(data.map((d: any) => ({
          id: d.id,
          companyId: d.companyId,
          companyName: d.company?.name || 'Empresa',
          invitedBy: d.invitedBy,
          inviterName: d.inviter?.name || d.inviter?.email || 'Usuário',
          role: d.role,
          status: d.status,
          createdAt: d.createdAt,
        })))
      }
    } catch { /* silent */ }
  }

  // ─── Load custom fields for company ───
  const loadCustomFields = async (companyId: string) => {
    try {
      const res = await fetch(`/api/companies/${companyId}/custom-fields`)
      if (res.ok) {
        const data = await res.json()
        setCustomFields(data)
      }
    } catch { /* silent */ }
  }

  // ─── Load custom field values for a DRE entry ───
  const loadCustomFieldValues = async (entryId: string) => {
    try {
      if (!entryId) return
      const res = await fetch(`/api/dre/custom-values?companyId=${selectedCompanyId}&dREEntryId=${entryId}`)
      if (res.ok) {
        const data = await res.json()
        setCustomFieldValues(data)
      }
    } catch { /* silent */ }
  }

  // ─── Save custom field values ───
  const saveCustomFieldValues = async (entryId: string, values: Record<string, number>) => {
    if (!entryId) return
    try {
      await fetch('/api/dre/custom-values', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dREEntryId: entryId, values }),
      })
    } catch { /* silent */ }
  }

  // ─── Handle add custom field ───
  const handleAddCustomField = async (section: string) => {
    if (!selectedCompanyId || !newCustomFieldName.trim()) return
    setAddingCustomLoading(true)
    try {
      const res = await fetch(`/api/companies/${selectedCompanyId}/custom-fields`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newCustomFieldName.trim(), section, sign: newCustomFieldSign }),
      })
      if (res.ok) {
        toast.success('Campo adicionado com sucesso')
        setNewCustomFieldName('')
        setNewCustomFieldSign('+')
        setAddingCustomField(null)
        loadCustomFields(selectedCompanyId)
      } else {
        const err = await res.json()
        toast.error(err.error || 'Erro ao adicionar campo')
      }
    } catch {
      toast.error('Erro ao adicionar campo')
    }
    setAddingCustomLoading(false)
  }

  // ─── Handle delete custom field ───
  const handleDeleteCustomField = async (fieldId: string) => {
    if (!selectedCompanyId) return
    try {
      const res = await fetch(`/api/companies/${selectedCompanyId}/custom-fields?fieldId=${fieldId}`, { method: 'DELETE' })
      if (res.ok) {
        toast.success('Campo removido')
        loadCustomFields(selectedCompanyId)
      } else {
        toast.error('Erro ao remover campo')
      }
    } catch {
      toast.error('Erro ao remover campo')
    }
  }

  // ─── Handle custom field value change ───
  const handleCustomFieldValueChange = (fieldId: string, value: number) => {
    setCustomFieldValues({ ...customFieldValues, [fieldId]: value })
  }

  // ─── Load companies ───
  const loadedRef = useRef(false)
  useEffect(() => {
    if (loadedRef.current) return
    loadedRef.current = true
    ;(async () => {
      try {
        const res = await fetch('/api/companies')
        if (res.ok) {
          const data = await res.json()
          setCompanies(data)
          const access: Record<string, 'owner' | 'viewer'> = {}
          for (const c of data) {
            access[c.id] = c.userId === userId ? 'owner' : 'viewer'
          }
          setCompanyAccess(access)
        }
      } catch { /* silent */ }
    })()
    loadPendingInvitations()
  }, [])

  // ─── Handle accept/reject invitation ───
  const handleInvitationAction = async (invitation: PendingInvitation, action: 'accept' | 'reject') => {
    try {
      const res = await fetch(`/api/companies/${invitation.companyId}/share`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      if (res.ok) {
        toast.success(action === 'accept' ? 'Convite aceito!' : 'Convite rejeitado')
        setPendingInvitations(pendingInvitations.filter(i => i.id !== invitation.id))
        if (action === 'accept') {
          const compRes = await fetch('/api/companies')
          if (compRes.ok) {
            const data = await compRes.json()
            setCompanies(data)
            const access: Record<string, 'owner' | 'viewer'> = {}
            for (const c of data) {
              access[c.id] = c.userId === userId ? 'owner' : 'viewer'
            }
            setCompanyAccess(access)
          }
        }
      } else {
        const err = await res.json()
        toast.error(err.error || 'Erro ao processar convite')
      }
    } catch {
      toast.error('Erro ao processar convite')
    }
  }

  // ─── Load shares for company ───
  const loadShares = async (companyId: string, accessMap: Record<string, 'owner' | 'viewer'>) => {
    if (accessMap[companyId] !== 'owner') { setShares([]); return }
    try {
      const res = await fetch(`/api/companies/${companyId}/share`)
      if (res.ok) {
        const data = await res.json()
        setShares(data)
      }
    } catch { /* silent */ }
  }


  const prevCompanyIdRef = useRef<string | null>(null)
  useEffect(() => {
    if (selectedCompanyId !== prevCompanyIdRef.current) {
      prevCompanyIdRef.current = selectedCompanyId
      if (selectedCompanyId) {
        loadCustomFields(selectedCompanyId)
        setCustomFieldValues({})
      }
    }
  }, [selectedCompanyId])

  // Load suggested changes on-demand (when dialog opens), not polling
  const loadSuggestedChanges = async (companyId: string) => {
    try {
      const res = await fetch(`/api/companies/${companyId}/suggested-changes`)
      if (res.ok) {
        const data = await res.json()
        setSuggestedChanges(data)
        setPendingChangesCount(data.filter((c: SuggestedChangeInfo) => c.status === 'pending').length)
      }
    } catch { /* silent */ }
  }

  // ─── Handle invite share ───
  const handleInviteShare = async () => {
    if (!selectedCompanyId || !inviteEmail.trim()) return
    setInvitingShare(true)
    try {
      const res = await fetch(`/api/companies/${selectedCompanyId}/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail.trim() }),
      })
      if (res.ok) {
        toast.success(`Convite enviado para ${inviteEmail.trim()}. O usuário receberá um email com instruções.`)
        setInviteEmail('')
        loadShares(selectedCompanyId, companyAccess)
      } else {
        const err = await res.json()
        toast.error(err.error || 'Erro ao convidar')
      }
    } catch {
      toast.error('Erro ao convidar usuário')
    }
    setInvitingShare(false)
  }

  // ─── Handle revoke share ───
  const handleRevokeShare = async (shareId: string) => {
    if (!selectedCompanyId) return
    try {
      const res = await fetch(`/api/companies/${selectedCompanyId}/share?shareId=${shareId}`, { method: 'DELETE' })
      if (res.ok) {
        toast.success('Compartilhamento revogado')
        loadShares(selectedCompanyId, companyAccess)
      } else {
        toast.error('Erro ao revogar')
      }
    } catch {
      toast.error('Erro ao revogar')
    }
  }

  // ─── Handle suggest change (viewer) ───
  const handleSuggestChange = async (dreField: string, newValue: number) => {
    if (!selectedCompanyId) return
    const oldValue = dreData[dreField as keyof DREData] as number
    try {
      const res = await fetch(`/api/companies/${selectedCompanyId}/suggested-changes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month: selectedMonth, year: selectedYear, dreField, oldValue, newValue }),
      })
      if (res.ok) {
        toast.success('Sugestão enviada ao proprietário')
        setSuggestedFields(prev => new Set(prev).add(dreField))
        setDREData({ [dreField]: newValue })
      } else {
        const err = await res.json()
        toast.error(err.error || 'Erro ao enviar sugestão')
      }
    } catch {
      toast.error('Erro ao enviar sugestão')
    }
  }

  // ─── Handle approve/reject suggested change (owner) ───
  const handleResolveChange = async (change: SuggestedChangeInfo, action: 'approve' | 'reject') => {
    if (!selectedCompanyId) return
    try {
      const res = await fetch(`/api/companies/${selectedCompanyId}/suggested-changes`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ changeId: change.id, action }),
      })
      if (res.ok) {
        toast.success(action === 'approve' ? 'Sugestão aprovada' : 'Sugestão rejeitada')
        loadSuggestedChanges(selectedCompanyId)
        setDRETrigger(t => t + 1)
      } else {
        const err = await res.json()
        toast.error(err.error || 'Erro ao processar sugestão')
      }
    } catch {
      toast.error('Erro ao processar sugestão')
    }
  }

  // ─── Load DRE when company/month/year changes ───
  const [dreTrigger, setDRETrigger] = useState(0)

  // Load history when company changes or when DRE data is saved/refreshed
  useEffect(() => {
    if (!selectedCompanyId) return
    ;(async () => {
      try {
        const histRes = await fetch(`/api/dre?companyId=${selectedCompanyId}&all=true`)
        if (histRes.ok) {
          const histData = await histRes.json()
          setAllHistory(histData.map((e: any) => {
            const calc = calcDRE(e)
            return { ...e, ...calc, label: `${MONTHS[e.month - 1].substring(0, 3)}/${String(e.year).slice(2)}` }
          }))
        }
      } catch { /* silent */ }
    })()
  }, [selectedCompanyId, dreTrigger])

  // Track previous month/year/company to distinguish initial load from refresh
  const prevLoadKeyRef = useRef('')

  useEffect(() => {
    let cancelled = false
    if (!selectedCompanyId) return
    const loadKey = `${selectedCompanyId}-${selectedMonth}-${selectedYear}`
    const isInitialLoad = loadKey !== prevLoadKeyRef.current
    prevLoadKeyRef.current = loadKey
    ;(async () => {
      if (isInitialLoad) setLoading(true)
      try {
        const dreRes = await fetch(`/api/dre?companyId=${selectedCompanyId}&month=${selectedMonth}&year=${selectedYear}`)
        if (dreRes.ok && !cancelled) {
          const data = await dreRes.json()
          if (data) {
            const { id, companyId, month, year, createdAt, updatedAt, company, ...fields } = data
            setDREData(fields)
            setDreEntryId(id || null)
            if (id) {
              loadCustomFieldValues(id)
            }
          } else {
            resetDREData()
            setDreEntryId(null)
            setCustomFieldValues({})
          }
        }
      } catch (e) {
        // silent
      }
      if (!cancelled && isInitialLoad) setLoading(false)
    })()
    return () => { cancelled = true }

  }, [selectedCompanyId, selectedMonth, selectedYear, dreTrigger])

  // ─── Load expense qualifications ───
  const [expTrigger, setExpTrigger] = useState(0)

  useEffect(() => {
    let cancelled = false
    if (!selectedCompanyId || activeTab !== 'expenses') return
    ;(async () => {
      try {
        const res = await fetch(`/api/dre/expense-qualification?companyId=${selectedCompanyId}&month=${selectedMonth}&year=${selectedYear}`)
        if (!cancelled && res.ok) {
          const data = await res.json()
          if (data.items) {
            setExpenseItems(data.items.map((d: any) => ({
              id: d.id, description: d.description, date: d.date, totalValue: d.totalValue,
              dreField: d.dreField || '', uploadedFileId: d.uploadedFileId,
            })))
          }
          if (data.uploadedFiles) {
            setUploadedFiles(data.uploadedFiles)
          }
        }
      } catch (e) { /* silent */ }
    })()
    return () => { cancelled = true }
  }, [selectedCompanyId, selectedMonth, selectedYear, expTrigger, activeTab])

  // ─── CNPJ mask ───
  const formatCnpj = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 14)
    if (digits.length <= 2) return digits
    if (digits.length <= 5) return `${digits.slice(0, 2)}.${digits.slice(2)}`
    if (digits.length <= 8) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5)}`
    if (digits.length <= 12) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8)}`
    return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`
  }

  // ─── Validate CNPJ via BrasilAPI ───
  const validateCnpj = async (rawCnpj: string) => {
    const digits = rawCnpj.replace(/\D/g, '')
    if (digits.length !== 14) {
      setCnpjValid(null)
      setCnpjMessage('')
      return
    }
    setCnpjValidating(true)
    setCnpjValid(null)
    setCnpjMessage('')
    try {
      const res = await fetch(`/api/cnpj-validator?cnpj=${digits}`)
      if (res.ok) {
        const data = await res.json()
        if (data.nome) {
          setNewCompanyName(data.nome)
          setCnpjValid(true)
          setCnpjMessage(data.fantasia ? `${data.fantasia} — ${data.situacao}` : data.situacao || 'CNPJ válido')
        }
      } else {
        const err = await res.json()
        setCnpjValid(false)
        setCnpjMessage(err.error || 'CNPJ inválido')
      }
    } catch {
      setCnpjValid(false)
      setCnpjMessage('Erro ao consultar CNPJ')
    }
    setCnpjValidating(false)
  }

  // ─── Handle create company (form submit) ───
  const handleCreateCompany = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newCompanyName.trim() || cnpjCreating) return
    setCnpjCreating(true)
    try {
      const res = await fetch('/api/companies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newCompanyName, cnpj: newCompanyCnpj }),
      })
      if (res.ok) {
        const company = await res.json()
        setCompanies([...companies, company])
        setCompanyAccess({ ...companyAccess, [company.id]: 'owner' })
        setSelectedCompany(company.id)
        setCompanyDialogOpen(false)
        setNewCompanyName('')
        setNewCompanyCnpj('')
        setCnpjValid(null)
        setCnpjMessage('')
        toast.success('Empresa criada com sucesso')
      } else {
        const err = await res.json()
        toast.error(err.error || 'Erro ao criar empresa')
      }
    } catch {
      toast.error('Erro ao criar empresa')
    }
    setCnpjCreating(false)
  }

  const handleDeleteCompany = async (id: string, saveData: boolean) => {
    if (saveData) {
      try {
        const res = await fetch(`/api/dre/export-company?companyId=${id}`)
        if (res.ok) {
          const blob = await res.blob()
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url
          const company = companies.find(c => c.id === id)
          a.download = `DRE_Completo_${(company?.name || 'Empresa').replace(/\s+/g, '_')}.xlsx`
          a.click()
          URL.revokeObjectURL(url)
          toast.success('Dados exportados com sucesso')
        }
      } catch {
        toast.error('Erro ao exportar dados')
      }
    }
    try {
      await fetch(`/api/companies?id=${id}`, { method: 'DELETE' })
      const newCompanies = companies.filter(c => c.id !== id)
      setCompanies(newCompanies)
      if (selectedCompanyId === id) {
        setSelectedCompany(newCompanies[0]?.id || null)
        resetDREData()
      }
      setExpenseItems([])
      setUploadedFiles([])
      toast.success('Empresa excluída')
    } catch {
      toast.error('Erro ao excluir empresa')
    }
    setDeleteDialogOpen(false)
    setDeleteSaveDialogOpen(false)
    setDeletingCompanyId(null)
  }

  // ─── Internal save DRE (no toast, used by auto-save) ───
  const handleSaveDREInternal = async (showToast = true) => {
    if (!selectedCompanyId || !isOwner) return
    setSaving(true)
    try {
      const res = await fetch('/api/dre', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId: selectedCompanyId, month: selectedMonth, year: selectedYear, ...dreData }),
      })
      if (res.ok) {
        const savedData = await res.json()
        if (savedData?.id) {
          setDreEntryId(savedData.id)
          await saveCustomFieldValues(savedData.id, customFieldValues)
        }
        if (showToast) toast.success('DRE salvo com sucesso')
        setDRETrigger(t => t + 1)
        setLastSavedAt(new Date().toLocaleTimeString('pt-BR'))
      } else {
        if (showToast) toast.error('Erro ao salvar DRE')
      }
    } catch {
      if (showToast) toast.error('Erro ao salvar DRE')
    }
    setSaving(false)
  }

  // ─── Partial save (RF-10): saves DRE + classifications + updates DRE with classified values ───
  const handlePartialSave = async () => {
    if (!selectedCompanyId || !isOwner) return
    setSaving(true)
    try {
      // 1. Save DRE form data directly (without triggering dreTrigger re-fetch)
      const dreRes = await fetch('/api/dre', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId: selectedCompanyId, month: selectedMonth, year: selectedYear, ...dreData }),
      })
      let currentDreEntryId = dreEntryId
      if (dreRes.ok) {
        const savedData = await dreRes.json()
        if (savedData?.id) {
          currentDreEntryId = savedData.id
          setDreEntryId(savedData.id)
          await saveCustomFieldValues(savedData.id, customFieldValues)
        }
      }
      // 2. Save partial expense classifications AND apply them to DRE
      const classifiedItems = expenseItems.filter(i => i.id && i.dreField)
      if (classifiedItems.length > 0) {
        // Save each classification to DB
        await Promise.all(
          classifiedItems.map(item =>
            fetch('/api/dre/expense-qualification/partial', {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ itemId: item.id, dreField: item.dreField }),
            })
          )
        )
        // Apply classified totals to DRE for current month
        const res = await fetch('/api/dre/expense-qualification/partial-apply', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            companyId: selectedCompanyId,
            month: selectedMonth,
            year: selectedYear,
          }),
        })
        if (res.ok) {
          const data = await res.json()
          if (data.updatedDREData) {
            const { _customFieldValues, ...dreFields } = data.updatedDREData
            setDREData({ ...dreData, ...dreFields })
            if (_customFieldValues) {
              setCustomFieldValues({ ...customFieldValues, ..._customFieldValues })
            }
            if (data.dreEntryId) {
              setDreEntryId(data.dreEntryId)
              currentDreEntryId = data.dreEntryId
            }
          }
        }
      }
      // 3. Update last saved timestamp
      setLastSavedAt(new Date().toLocaleTimeString('pt-BR'))
      toast.success('Dados salvos com sucesso!', { duration: 3000, icon: <CheckCircle2 className="h-4 w-4" /> })
    } catch {
      toast.error('Erro ao salvar parcialmente')
    }
    setSaving(false)
  }

  // ─── Refresh All Data: reload DRE, expenses, history from server ───
  const handleRefreshAll = async () => {
    if (!selectedCompanyId) return
    try {
      // 1. Save current data first
      await handleSaveDREInternal(false)
      // 2. Reload DRE data
      setDRETrigger(t => t + 1)
      // 3. Reload expense items
      setExpTrigger(t => t + 1)
      // 4. Reload history
      const histRes = await fetch(`/api/dre?companyId=${selectedCompanyId}&all=true`)
      if (histRes.ok) {
        const histData = await histRes.json()
        setAllHistory(histData.map((e: any) => {
          const calc = calcDRE(e)
          return { ...e, ...calc, label: `${MONTHS[e.month - 1].substring(0, 3)}/${String(e.year).slice(2)}` }
        }))
      }
      toast.success('Dados atualizados com sucesso')
    } catch {
      toast.error('Erro ao atualizar dados')
    }
  }

  // ─── Saldo Atual = Resultado Líquido do mês anterior ───
  const saldoAtual = useMemo(() => {
    if (!selectedCompanyId || selectedMonth === 1) return 0
    const prevMonth = selectedMonth === 1 ? 12 : selectedMonth - 1
    const prevYear = selectedMonth === 1 ? selectedYear - 1 : selectedYear
    const prevEntry = allHistory.find((e: any) => e.month === prevMonth && e.year === prevYear)
    return prevEntry?.resultadoLiquido || 0
  }, [selectedCompanyId, selectedMonth, selectedYear, allHistory])

  const handleSaveDRE = async () => { await handleSaveDREInternal(true) }

  const handleUploadExpense = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !selectedCompanyId) return
    setExpenseUploading(true)
    setUploadProgress(10)
    setUploadFileName(file.name)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('companyId', selectedCompanyId)
      formData.append('month', String(selectedMonth))
      formData.append('year', String(selectedYear))
      setUploadProgress(30)
      const res = await fetch('/api/dre/expense-qualification', { method: 'POST', body: formData })
      setUploadProgress(70)
      if (res.ok) {
        const data = await res.json()
        setUploadProgress(90)
        // Only show items for the currently selected month in the qualification table
        const currentMonthItems = data.items.filter((item: any) => item.month === selectedMonth && item.year === selectedYear)
        const newItems = currentMonthItems.map((item: any) => ({ ...item, dreField: item.dreField || '' }))
        setExpenseItems([...expenseItems, ...newItems])
        if (data.file) {
          setUploadedFiles([...uploadedFiles, data.file])
        }
        // RF-04: Store parser feedback
        if (data.distributedMonths) setDistributedMonths(data.distributedMonths)
        if (data.autoClassified) setAutoClassified(data.autoClassified)
        // Auto-update DRE data if the current month was updated by the parser
        if (data.updatedDREForMonths) {
          const currentMonthKey = `${selectedMonth}-${selectedYear}`
          const monthUpdate = data.updatedDREForMonths[currentMonthKey]
          if (monthUpdate) {
            setDREData({ ...dreData, ...monthUpdate })
          }
          // Also reload DRE data and history for charts
          setDRETrigger(t => t + 1)
          const histRes = await fetch(`/api/dre?companyId=${selectedCompanyId}&all=true`)
          if (histRes.ok) {
            const histData = await histRes.json()
            setAllHistory(histData.map((e: any) => {
              const calc = calcDRE(e)
              return { ...e, ...calc, label: `${MONTHS[e.month - 1].substring(0, 3)}/${String(e.year).slice(2)}` }
            }))
          }
        }
        // RF-04: Show structural titles found
        if (data.structuralTitlesFound > 0) {
          toast.success(`Planilha importada: ${file.name} (${data.items.length} itens, ${data.structuralTitlesFound} títulos estruturais reconhecidos)`)
        } else {
          toast.success(`Planilha importada: ${file.name} (${data.items.length} itens)`)
        }
        setUploadProgress(100)
      } else {
        const err = await res.json()
        toast.error(err.error || 'Erro ao processar planilha')
        setUploadProgress(0)
        setUploadFileName('')
      }
    } catch {
      toast.error('Erro ao fazer upload')
      setUploadProgress(0)
      setUploadFileName('')
    }
    setTimeout(() => {
      setExpenseUploading(false)
      setUploadProgress(0)
    }, 600)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // RF-07: Reactive sync - after classification, immediately update DRE data
  const handleSaveExpenseClassification = async () => {
    if (!selectedCompanyId) return
    const unmapped = expenseItems.filter(i => !i.dreField)
    if (unmapped.length > 0) {
      toast.error(`${unmapped.length} item(ns) sem classificação. Classifique todos antes de aplicar.`)
      return
    }
    setApplying(true)
    try {
      const res = await fetch('/api/dre/expense-qualification', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId: selectedCompanyId, month: selectedMonth, year: selectedYear, items: expenseItems }),
      })
      if (res.ok) {
        const data = await res.json()
        // RF-07: Reactive sync - update DRE data immediately without reload
        if (data.updatedDREData) {
          const { _customFieldValues, ...dreFields } = data.updatedDREData
          setDREData(dreFields)
          if (_customFieldValues) {
            setCustomFieldValues({ ...customFieldValues, ..._customFieldValues })
          }
          setDreEntryId(data.dreEntryId || dreEntryId)
        }
        // Always reload history for charts/projections to stay in sync
        setExpTrigger(t => t + 1)
        setDRETrigger(t => t + 1)
        // Also reload history for charts
        const histRes = await fetch(`/api/dre?companyId=${selectedCompanyId}&all=true`)
        if (histRes.ok) {
          const histData = await histRes.json()
          setAllHistory(histData.map((e: any) => {
            const calc = calcDRE(e)
            return { ...e, ...calc, label: `${MONTHS[e.month - 1].substring(0, 3)}/${String(e.year).slice(2)}` }
          }))
        }
        toast.success('Valores aplicados ao DRE com sucesso')
      } else {
        const err = await res.json()
        toast.error(err.error || 'Erro ao aplicar valores')
      }
    } catch {
      toast.error('Erro ao salvar qualificação')
    }
    setApplying(false)
  }

  const handleDeleteFiles = async (fileIds: string[]) => {
    if (!selectedCompanyId || fileIds.length === 0) return
    try {
      const res = await fetch(`/api/dre/expense-qualification?fileIds=${fileIds.join(',')}`, { method: 'DELETE' })
      if (res.ok) {
        // Optimistically remove from state (no re-fetch trigger to avoid race condition)
        setUploadedFiles(uploadedFiles.filter(f => !fileIds.includes(f.id)))
        setExpenseItems(expenseItems.filter(i => !i.uploadedFileId || !fileIds.includes(i.uploadedFileId)))
        toast.success(`${fileIds.length} arquivo(s) excluído(s) com sucesso`, { duration: 3000 })
        return true
      } else {
        const err = await res.json().catch(() => null)
        toast.error(err?.error || 'Erro ao excluir arquivos')
        return false
      }
    } catch (err) {
      console.error('Delete files error:', err)
      toast.error('Erro ao excluir arquivos')
      return false
      }
  }

  const handleProjection = async () => {
    if (!selectedCompanyId) return
    setProjecting(true)
    try {
      const res = await fetch('/api/dre/projection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId: selectedCompanyId, period: projectionPeriod, currentMonth: selectedMonth, currentYear: selectedYear }),
      })
      if (res.ok) {
        const data = await res.json()
        setProjectionResult(data)
        setProjectionData(data.projections)
        toast.success('Projeção gerada com sucesso')
      } else {
        const err = await res.json()
        toast.error(err.error || 'Erro ao gerar projeção')
      }
    } catch {
      toast.error('Erro ao gerar projeção')
    }
    setProjecting(false)
  }

  const handleProjectionFieldChange = (idx: number, field: string, value: number) => {
    if (!projectionResult) return
    const projIdx = idx - projectionResult.historical.length
    if (projIdx < 0) return
    const newProjections = [...projectionResult.projections]
    newProjections[projIdx] = { ...newProjections[projIdx], [field]: value }
    const p = newProjections[projIdx]
    const rb = (p.honorariosSucumbenciais || 0) + (p.honorarios || 0) + (p.rendimentos || 0) + (p.naoIdentificado || 0)
    const rl = rb - (p.impostosCpp || 0)
    const dv = (p.combustivel||0)+(p.insumos||0)+(p.materialEscritorio||0)+(p.servicosContratados||0)+(p.materiaisUsoConsumo||0)+(p.taxas||0)+(p.tarifas||0)+(p.energiaEletrica||0)+(p.agua||0)
    const df = (p.aluguel||0)+(p.salarios||0)+(p.fgts||0)+(p.prolabore||0)+(p.bonus||0)+(p.inss||0)+(p.iptu||0)+(p.telefoneInternet||0)+(p.valeTransporte||0)+(p.planoSaude||0)
    newProjections[projIdx] = { ...newProjections[projIdx], receitaBruta: rb, receitaLiquida: rl, despesasVariaveis: dv, despesasFixas: df, resultadoLiquido: rl - dv - df }
    setProjectionResult({ ...projectionResult, projections: newProjections })
  }

  const handleExportExcel = async () => {
    if (!selectedCompanyId) return
    try {
      const res = await fetch(`/api/dre/export?companyId=${selectedCompanyId}&type=excel`)
      if (res.ok) {
        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = 'DRE_Exportacao.xlsx'
        a.click()
        URL.revokeObjectURL(url)
        toast.success('Exportação realizada com sucesso')
      }
    } catch {
      toast.error('Erro ao exportar')
    }
  }

  const handlePrintPDF = () => {
    window.print()
  }

  const prevMonth = () => {
    if (selectedMonth === 1) { setSelectedMonth(12); setSelectedYear(selectedYear - 1) }
    else setSelectedMonth(selectedMonth - 1)
  }
  const nextMonth = () => {
    if (selectedMonth === 12) { setSelectedMonth(1); setSelectedYear(selectedYear + 1) }
    else setSelectedMonth(selectedMonth + 1)
  }

  const userName = session?.user?.name || ''
  const userEmail = session?.user?.email || ''
  const userInitial = userName ? userName.charAt(0).toUpperCase() : userEmail.charAt(0).toUpperCase()

  // ─── Render ───
  return (
    <TooltipProvider>
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 print:hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
                  <BarChart3 className="h-4 w-4 text-primary-foreground" />
                </div>
                <h1 className="text-lg font-semibold tracking-tight">DRE Online</h1>
                <Badge variant="secondary" className="text-[10px] hidden sm:inline-flex">Planejamento Orçamentário</Badge>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {isOwner && selectedCompanyId && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="outline" size="sm" onClick={() => { loadShares(selectedCompanyId!, companyAccess); setShareDialogOpen(true) }}>
                      <Users className="h-4 w-4 mr-1.5" />
                      <span className="hidden sm:inline">Compartilhar</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Compartilhar empresa</TooltipContent>
                </Tooltip>
              )}
              {isOwner && selectedCompanyId && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="outline" size="icon" className="relative h-9 w-9" onClick={() => { if (selectedCompanyId) loadSuggestedChanges(selectedCompanyId); setChangesDialogOpen(true) }}>
                      <Bell className="h-4 w-4" />
                      {pendingChangesCount > 0 && (
                        <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-red-500 text-[10px] font-bold text-white flex items-center justify-center">
                          {pendingChangesCount > 9 ? '9+' : pendingChangesCount}
                        </span>
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Sugestões pendentes</TooltipContent>
                </Tooltip>
              )}
              <Button variant="outline" size="sm" onClick={handleExportExcel} disabled={!selectedCompanyId}>
                <FileSpreadsheet className="h-4 w-4 mr-1.5" />
                <span className="hidden sm:inline">Excel</span>
              </Button>
              <Button variant="outline" size="sm" onClick={handlePrintPDF} disabled={!selectedCompanyId}>
                <Printer className="h-4 w-4 mr-1.5" />
                <span className="hidden sm:inline">PDF</span>
              </Button>
              {isOwner && selectedCompanyId && (
                <>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="outline" size="sm" onClick={async () => {
                        setSaving(true)
                        try {
                          await handlePartialSave()
                        } catch {
                          // error handled by handlePartialSave
                        }
                        setSaving(false)
                      }} disabled={!selectedCompanyId || isViewer || saving}>
                        {saving
                          ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Salvando...</>
                          : <><Save className="h-4 w-4 mr-1.5" /><span className="hidden sm:inline">Salvar Parcial</span></>
                        }
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Salvar progresso atual sem fechar</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="outline" size="sm" onClick={handleRefreshAll} disabled={!selectedCompanyId}>
                        <RefreshCw className="h-4 w-4 mr-1.5" />
                        <span className="hidden sm:inline">Atualizar</span>
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Recarregar dados do servidor</TooltipContent>
                  </Tooltip>
                </>
              )}
              {lastSavedAt && (
                <span className="text-[10px] text-muted-foreground hidden lg:inline-flex items-center gap-1">
                  <Clock className="h-3 w-3" /> Salvo às {lastSavedAt}
                </span>
              )}
              {/* User Dropdown */}
              <DropdownMenu open={userMenuOpen} onOpenChange={setUserMenuOpen}>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="relative h-9 w-9 rounded-full ml-1">
                    <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center text-sm font-semibold text-primary">
                      {userInitial}
                    </div>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-72" align="end" forceMount>
                  <DropdownMenuLabel className="font-normal">
                    <div className="flex flex-col space-y-1">
                      <div className="flex items-center gap-2.5">
                        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-semibold text-primary flex-shrink-0">
                          {userInitial}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium leading-none truncate">{userName || 'Usuário'}</p>
                          <p className="text-xs text-muted-foreground leading-none mt-1 truncate">{userEmail}</p>
                        </div>
                      </div>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <Building2 className="h-3 w-3" /> Minhas Empresas
                  </DropdownMenuLabel>
                  {companies.filter(c => c.userId === userId).map(c => (
                    <DropdownMenuItem key={c.id} className="flex items-center gap-2 cursor-pointer" onClick={() => { setSelectedCompany(c.id); setUserMenuOpen(false) }}>
                      <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
                      <span className="truncate text-sm">{c.name}</span>
                      <Badge variant="outline" className="ml-auto text-[9px] h-4 px-1.5">Proprietário</Badge>
                    </DropdownMenuItem>
                  ))}
                  {companies.filter(c => c.userId !== userId).map(c => (
                    <DropdownMenuItem key={c.id} className="flex items-center gap-2 cursor-pointer" onClick={() => { setSelectedCompany(c.id); setUserMenuOpen(false) }}>
                      <Eye className="h-3.5 w-3.5 text-blue-500" />
                      <span className="truncate text-sm">{c.name}</span>
                      <Badge variant="outline" className="ml-auto text-[9px] h-4 px-1.5">Convidado</Badge>
                    </DropdownMenuItem>
                  ))}
                  {pendingInvitations.length > 0 && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem className="flex items-center gap-2 cursor-pointer font-medium text-amber-600" onClick={() => { setInvitationsDialogOpen(true); setUserMenuOpen(false) }}>
                        <UserPlus className="h-3.5 w-3.5" />
                        Convites
                        <Badge className="ml-auto bg-amber-500 text-white text-[10px] h-5 min-w-[20px] flex items-center justify-center px-1.5">{pendingInvitations.length}</Badge>
                      </DropdownMenuItem>
                    </>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="flex items-center gap-2 cursor-pointer text-destructive focus:text-destructive" onClick={() => { setUserMenuOpen(false); signOut({ redirect: true, callbackUrl: '/' }) }}>
                    <LogOut className="h-4 w-4" />
                    Sair
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 print:p-4">
        {/* Company Selector + Period */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6 print:hidden items-start">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <Select value={selectedCompanyId || ''} onValueChange={(v) => {
                setSelectedCompany(v)
                resetDREData()
                setExpenseItems([])
                setUploadedFiles([])
                setProjectionResult(null)
                setSuggestedFields(new Set())
                setCustomFieldValues({})
                setDreEntryId(null)
              }}>
                <SelectTrigger className="h-9 w-full">
                  <Building2 className="h-4 w-4 mr-2 text-muted-foreground" />
                  <SelectValue placeholder="Selecione uma empresa" />
                </SelectTrigger>
                <SelectContent>
                  {companies.map(c => (
                    <SelectItem key={c.id} value={c.id}>
                      <span className="flex items-center gap-2">
                        {c.userId === userId
                          ? <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
                          : <Eye className="h-3.5 w-3.5 text-blue-500" />}
                        {c.cnpj ? `${c.name} - ${c.cnpj}` : c.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedCompanyId && isOwner && (
                <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground hover:text-destructive flex-shrink-0"
                  title="Excluir empresa"
                  onClick={() => {
                    const c = companies.find(x => x.id === selectedCompanyId)
                    if (c) {
                      setDeletingCompanyId(c.id)
                      setDeletingCompanyName(c.name)
                      setDeleteDialogOpen(true)
                    }
                  }}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
            {isOwner && Object.values(companyAccess).filter(a => a === 'owner').length < 5 && (
              <Button variant="ghost" size="sm" className="h-9 text-xs flex-shrink-0" onClick={() => setCompanyDialogOpen(true)}>
                <Plus className="h-3 w-3 mr-1" /> Nova empresa ({Object.values(companyAccess).filter(a => a === 'owner').length}/5)
              </Button>
            )}
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <Button variant="outline" size="icon" onClick={prevMonth} className="h-9 w-9">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Select value={String(selectedMonth)} onValueChange={(v) => setSelectedMonth(parseInt(v))}>
              <SelectTrigger className="h-9 w-[130px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MONTHS.map((m, i) => (
                  <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={String(selectedYear)} onValueChange={(v) => setSelectedYear(parseInt(v))}>
              <SelectTrigger className="h-9 w-[85px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i).map(y => (
                  <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="icon" onClick={nextMonth} className="h-9 w-9">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {!selectedCompanyId ? (
          <Card className="max-w-md mx-auto mt-20">
            <CardContent className="flex flex-col items-center py-12 text-center">
              <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
                <Building2 className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="font-semibold text-lg mb-2">Bem-vindo ao DRE Online</h3>
              <p className="text-sm text-muted-foreground mb-6">
                Selecione uma empresa existente ou crie uma nova para começar o planejamento orçamentário.
              </p>
              <Button onClick={() => setCompanyDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-2" /> Criar Primeira Empresa
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Tabs value={activeTab} onValueChange={(newTab) => {
            // RF-09: Save scroll position before switching tabs
            const mainEl = document.querySelector('main')
            if (mainEl) {
              const { setScrollPosition } = useAppStore.getState()
              setScrollPosition(activeTab, mainEl.scrollTop)
            }
            setActiveTab(newTab)
            // Restore scroll position after tab switch
            requestAnimationFrame(() => {
              const { navigationState } = useAppStore.getState()
              const savedScroll = navigationState.scrollPosition[newTab]
              if (savedScroll && mainEl) {
                mainEl.scrollTop = savedScroll
              }
            })
          }} className="space-y-4">
            <TabsList className="w-full flex print:hidden">
              <TabsTrigger value="dre" className="flex-1"><DollarSign className="h-4 w-4 mr-2" />DRE Mensal</TabsTrigger>
              <TabsTrigger value="expenses" className="flex-1"><FileUp className="h-4 w-4 mr-2" />Qualificação</TabsTrigger>
              <TabsTrigger value="projection" className="flex-1"><TrendingUp className="h-4 w-4 mr-2" />Projeção</TabsTrigger>
              <TabsTrigger value="charts" className="flex-1"><PieChart className="h-4 w-4 mr-2" />Gráficos</TabsTrigger>
            </TabsList>

            <TabsContent value="dre">
              <DREMonthlyTab
                dreData={dreData}
                setDREData={setDREData}
                customFields={customFields}
                customFieldValues={customFieldValues}
                setCustomFieldValues={setCustomFieldValues}
                isViewer={isViewer}
                isOwner={isOwner}
                suggestedFields={suggestedFields}
                dreEntryId={dreEntryId}
                addingCustomField={addingCustomField}
                setAddingCustomField={setAddingCustomField}
                newCustomFieldName={newCustomFieldName}
                setNewCustomFieldName={setNewCustomFieldName}
                newCustomFieldSign={newCustomFieldSign}
                setNewCustomFieldSign={setNewCustomFieldSign}
                addingCustomLoading={addingCustomLoading}
                handleAddCustomField={handleAddCustomField}
                handleDeleteCustomField={handleDeleteCustomField}
                handleCustomFieldValueChange={handleCustomFieldValueChange}
                saveCustomFieldValues={saveCustomFieldValues}
                handleSuggestChange={isViewer ? handleSuggestChange : undefined}
                saving={saving}
                handleSaveDRE={handleSaveDRE}
                loading={loading}
                selectedMonth={selectedMonth}
                selectedYear={selectedYear}
                saldoAtual={saldoAtual}
                onRefresh={handleRefreshAll}
              />
            </TabsContent>

            <TabsContent value="expenses">
              <QualificationTab
                expenseItems={expenseItems}
                setExpenseItems={setExpenseItems}
                uploadedFiles={uploadedFiles}
                setUploadedFiles={setUploadedFiles}
                expenseUploading={expenseUploading}
                uploadProgress={uploadProgress}
                uploadFileName={uploadFileName}
                selectedCompanyId={selectedCompanyId}
                selectedMonth={selectedMonth}
                selectedYear={selectedYear}
                isOwner={isOwner}
                fileInputRef={fileInputRef}
                handleUploadExpense={handleUploadExpense}
                handleSaveExpenseClassification={handleSaveExpenseClassification}
                handleDeleteFiles={handleDeleteFiles}
                handlePartialSave={handlePartialSave}
                applying={applying}
                customFields={customFields}
                distributedMonths={distributedMonths}
                autoClassified={autoClassified}
                partialSaving={saving}
              />
            </TabsContent>

            <TabsContent value="projection">
              <ProjectionTab
                projectionResult={projectionResult}
                projectionPeriod={projectionPeriod}
                setProjectionPeriod={setProjectionPeriod}
                projecting={projecting}
                allHistory={allHistory}
                expandedProjectionIdx={expandedProjectionIdx}
                setExpandedProjectionIdx={setExpandedProjectionIdx}
                handleProjection={handleProjection}
                handleProjectionFieldChange={handleProjectionFieldChange}
              />
            </TabsContent>

            <TabsContent value="charts">
              <ChartsTab allHistory={allHistory} />
            </TabsContent>
          </Tabs>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t mt-auto print:hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between text-xs text-muted-foreground">
          <span>DRE Online — Planejamento Orçamentário para Escritórios de Advocacia</span>
          <span>{new Date().getFullYear()}</span>
        </div>
      </footer>

      {/* ─── Dialogs ─── */}

      {/* Delete Confirmation Dialog - Step 1 */}
      <Dialog open={deleteDialogOpen} onOpenChange={(open) => { if (!open) setDeleteDialogOpen(false) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-destructive" />
              Confirmar Exclusão
            </DialogTitle>
            <DialogDescription>
              Tem certeza que deseja excluir <strong>{deletingCompanyName}</strong>?
              Esta ação não poderá ser desfeita e todos os dados serão perdidos.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={() => { setDeleteDialogOpen(false); setDeleteSaveDialogOpen(true) }}>
              Sim, Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog - Step 2 */}
      <Dialog open={deleteSaveDialogOpen} onOpenChange={(open) => { if (!open) setDeleteSaveDialogOpen(false) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Download className="h-5 w-5 text-primary" />
              Salvar Dados Antes de Excluir?
            </DialogTitle>
            <DialogDescription>
              Deseja exportar todos os dados do DRE de <strong>{deletingCompanyName}</strong>
              em uma planilha Excel (cada mês em uma aba separada) antes de excluir?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => { if (deletingCompanyId) handleDeleteCompany(deletingCompanyId, false) }}>
              Excluir sem Salvar
            </Button>
            <Button onClick={() => { if (deletingCompanyId) handleDeleteCompany(deletingCompanyId, true) }}>
              <Download className="h-4 w-4 mr-1.5" /> Salvar e Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Company Dialog */}
      <Dialog open={companyDialogOpen} onOpenChange={(open) => {
        if (!open) {
          setNewCompanyName('')
          setNewCompanyCnpj('')
          setCnpjValid(null)
          setCnpjMessage('')
        }
        setCompanyDialogOpen(open)
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nova Empresa</DialogTitle>
            <DialogDescription>Informe o CNPJ para buscar automaticamente os dados. Máximo de 5 empresas.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateCompany} className="space-y-4 py-2">
            <div>
              <Label className="mb-1.5 block">CNPJ (opcional)</Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    placeholder="00.000.000/0001-00"
                    value={newCompanyCnpj}
                    onChange={(e) => {
                      const masked = formatCnpj(e.target.value)
                      setNewCompanyCnpj(masked)
                      setCnpjValid(null)
                      setCnpjMessage('')
                    }}
                  />
                  {cnpjValidating && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />}
                  {!cnpjValidating && cnpjValid === true && <CheckCircle2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-emerald-500" />}
                  {!cnpjValidating && cnpjValid === false && <AlertCircle className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-red-500" />}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="shrink-0"
                  disabled={newCompanyCnpj.replace(/\D/g, '').length !== 14 || cnpjValidating}
                  onClick={() => validateCnpj(newCompanyCnpj)}
                >
                  {cnpjValidating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                </Button>
              </div>
              {cnpjMessage && (
                <p className={`text-xs mt-1.5 ${cnpjValid ? 'text-emerald-600' : 'text-red-500'}`}>
                  {cnpjMessage}
                </p>
              )}
            </div>
            <div>
              <Label className="mb-1.5 block">Nome da Empresa *</Label>
              <Input
                placeholder="Ex: Advocacia Silva & Associados"
                value={newCompanyName}
                onChange={(e) => setNewCompanyName(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setCompanyDialogOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={!newCompanyName.trim() || cnpjCreating}>
                {cnpjCreating ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : null}
                Criar Empresa
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Share Dialog */}
      <Dialog open={shareDialogOpen} onOpenChange={setShareDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Users className="h-5 w-5" />Compartilhar Empresa</DialogTitle>
            <DialogDescription>Convide pessoas para visualizar e sugerir alterações nesta empresa.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="flex gap-2">
              <Input type="email" placeholder="email@exemplo.com" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleInviteShare()} className="flex-1" />
              <Button onClick={handleInviteShare} disabled={invitingShare || !inviteEmail.trim()}>
                {invitingShare ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Send className="h-4 w-4 mr-1.5" />}
                Convidar
              </Button>
            </div>
            {shares.length > 0 ? (
              <div className="space-y-2">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Compartilhamentos ({shares.length})</h4>
                <div className="max-h-64 overflow-y-auto space-y-2">
                  {shares.map((share) => {
                    const statusColor = share.status === 'accepted' ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
                      : share.status === 'pending' ? 'bg-amber-100 text-amber-700 border-amber-200'
                      : 'bg-red-100 text-red-700 border-red-200'
                    const statusLabel = share.status === 'accepted' ? 'Aceito' : share.status === 'pending' ? 'Pendente' : 'Rejeitado'
                    return (
                      <div key={share.id} className="flex items-center gap-3 p-3 rounded-lg border bg-card">
                        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-semibold text-primary flex-shrink-0">
                          {(share.user?.name || share.user?.email || '?').charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{share.user?.name || 'Sem nome'}</p>
                          <p className="text-xs text-muted-foreground truncate">{share.user?.email}</p>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <Badge variant="outline" className={`text-[10px] ${statusColor}`}>{statusLabel}</Badge>
                          {share.status === 'accepted' && (
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => handleRevokeShare(share.id)} title="Revogar acesso">
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Users className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">Nenhum compartilhamento ainda.</p>
                <p className="text-xs mt-1">Convide alguém pelo email acima.</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Pending Invitations Dialog */}
      <Dialog open={invitationsDialogOpen} onOpenChange={setInvitationsDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><UserPlus className="h-5 w-5" />Convites Pendentes</DialogTitle>
            <DialogDescription>Empresas que compartilharam dados com você.</DialogDescription>
          </DialogHeader>
          <div className="py-2">
            {pendingInvitations.length > 0 ? (
              <div className="space-y-3">
                {pendingInvitations.map((inv) => (
                  <div key={inv.id} className="flex items-center gap-3 p-3 rounded-lg border bg-card">
                    <div className="h-10 w-10 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                      <Building2 className="h-5 w-5 text-amber-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{inv.companyName}</p>
                      <p className="text-xs text-muted-foreground">
                        Convidado por <strong>{inv.inviterName}</strong> · {new Date(inv.createdAt).toLocaleDateString('pt-BR')}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <Button size="sm" className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700" onClick={() => handleInvitationAction(inv, 'accept')}>
                        <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Aceitar
                      </Button>
                      <Button size="sm" variant="outline" className="h-8 text-xs text-destructive" onClick={() => handleInvitationAction(inv, 'reject')}>
                        <X className="h-3 w-3 mr-1" /> Rejeitar
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <CheckCircle2 className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">Nenhum convite pendente.</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Suggested Changes Dialog */}
      <Dialog open={changesDialogOpen} onOpenChange={(open) => { setChangesDialogOpen(open); if (open && selectedCompanyId) loadSuggestedChanges(selectedCompanyId) }}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5" />
              Sugestões Pendentes
              {pendingChangesCount > 0 && <Badge className="bg-red-500 text-white">{pendingChangesCount}</Badge>}
            </DialogTitle>
            <DialogDescription>Alterações sugeridas por convidados desta empresa.</DialogDescription>
          </DialogHeader>
          <div className="py-2">
            {suggestedChanges.filter(c => c.status === 'pending').length > 0 ? (
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {suggestedChanges.filter(c => c.status === 'pending').map((change) => (
                  <div key={change.id} className="flex items-start gap-3 p-4 rounded-lg border bg-card">
                    <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center text-sm font-semibold text-primary flex-shrink-0 mt-0.5">
                      {(change.suggester?.name || change.suggester?.email || '?').charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium">{change.suggester?.name || 'Usuário'}</span>
                        <span className="text-xs text-muted-foreground">{change.suggester?.email}</span>
                      </div>
                      <div className="flex items-center gap-4 text-sm flex-wrap">
                        <span className="text-muted-foreground">
                          <strong className="text-foreground">{DRE_FIELD_LABELS[change.dreField] || change.dreField}</strong>
                          {' '}({MONTHS[change.month - 1]}/{change.year})
                        </span>
                        <span className="font-mono text-xs">
                          <span className="line-through text-muted-foreground">{brlAccounting(change.oldValue).text}</span>
                          {' → '}
                          <span className={`font-semibold ${change.newValue < 0 ? 'text-red-600' : 'text-emerald-600'}`}>{brlAccounting(change.newValue).text}</span>
                        </span>
                      </div>
                      <p className="text-[10px] text-muted-foreground">{new Date(change.createdAt).toLocaleString('pt-BR')}</p>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <Button size="sm" className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700" onClick={() => handleResolveChange(change, 'approve')}>
                        <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Aprovar
                      </Button>
                      <Button size="sm" variant="outline" className="h-8 text-xs text-destructive" onClick={() => handleResolveChange(change, 'reject')}>
                        <X className="h-3 w-3 mr-1" /> Rejeitar
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Bell className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">Nenhuma sugestão pendente.</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

    </div>
    </TooltipProvider>
  )
}

// ─── Default Export ───
export default function Page() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  )
}
