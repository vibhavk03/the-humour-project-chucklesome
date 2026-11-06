'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import {
  Menu as MenuIcon,
  ChevronDown,
  Users,
  Home,
  Layers,
  Bug,
  Shield,
  QrCode,
  PanelsTopLeft,
  Sticker,
  Bot,
  ListChecks,
  FileText,
  BarChart3,
  FlaskConical,
  KeyRound,
  LogOut,
  Settings,
  ContactRound,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import TimezoneSelect from '@/components/TimezoneSelect'
import { Button } from '@/components/ui/button'
import { signOutAction } from '@/app/actions'
import { checkAuth } from '@/utils/auth'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useTheme } from 'next-themes'

type Item = {
  label: string
  href?: string
  icon?: React.ReactNode
  children?: Item[]
}

const NAV: Item[] = [
  { label: 'Overview', href: '/overview', icon: <Home className="h-4 w-4" /> },
  {
    label: 'Users',
    icon: <Users className="h-4 w-4" />,
    children: [
      { label: 'Users', href: '/users' },
      { label: 'Bulk Permissions', href: '/users/bulk-permissions' },
    ],
  },
  {
    label: 'Clients',
    href: '/clients',
    icon: <KeyRound className="h-4 w-4" />,
  },
  {
    label: 'Images',
    icon: <PanelsTopLeft className="h-4 w-4" />,
    children: [
      { label: 'Images', href: '/images' },
      { label: 'Upload Images', href: '/common-use/upload' },
      { label: 'External Image Replacement Jobs', href: '/external-image-replacement-jobs' },
      { label: 'Image Categories', href: '/image-categories' },
    ],
  },
  {
    label: 'Communities',
    icon: <Users className="h-4 w-4" />,
    children: [
      { label: 'Communities', href: '/communities' },
      { label: 'Community Contexts', href: '/community-contexts' },
      { label: 'Community Context Tags', href: '/community-context-tags' },
    ],
  },
  {
    label: 'Captions',
    icon: <Sticker className="h-4 w-4" />,
    children: [
      { label: 'Captions', href: '/captions' },
      { label: 'Caption Jobs', href: '/caption-jobs' },
      { label: 'Caption Requests', href: '/caption-requests' },
      { label: 'Caption Examples', href: '/caption-examples' },
    ],
  },
  {
    label: 'Studies',
    icon: <FlaskConical className="h-4 w-4" />,
    children: [
      { label: 'Study Wizard', href: '/study/wizard' },
      { label: 'Quick Study', href: '/study-quick' },
      { label: 'Experiments', href: '/experiments' },
      { label: 'Studies', href: '/studies' },
      { label: 'Image Sets', href: '/study-image-sets' },
      { label: 'Caption Mappings', href: '/study-caption-mappings' },
      { label: 'Generate Captions', href: '/study/generate-captions' },
    ],
  },
  {
    label: 'Humor Pipeline',
    icon: <Layers className="h-4 w-4" />,
    children: [
      { label: 'Humor Flavors', href: '/humor-flavors' },
      { label: 'Humor Themes', href: '/humor-themes' },
      { label: 'Humor Mix', href: '/humor-mix' },
      { label: 'Humor Potential Prompts', href: '/image-humor-potential-prompts' },
    ],
  },
  {
    label: 'LLM',
    icon: <Bot className="h-4 w-4" />,
    children: [
      { label: 'LLM Models', href: '/llm-models' },
      { label: 'LLM Providers', href: '/llm-providers' },
      { label: 'LLM Prompt Chains', href: '/llm-prompt-chains' },
      { label: 'LLM Responses', href: '/llm-responses' },
    ],
  },
  {
    label: 'Terms',
    icon: <FileText className="h-4 w-4" />,
    children: [
      { label: 'Terms', href: '/terms' },
      { label: 'Term Types', href: '/term-types' },
    ],
  },
  {
    label: 'Whitelist',
    icon: <Shield className="h-4 w-4" />,
    children: [
      { label: 'Domains', href: '/allowed-domains' },
      { label: 'E-Mail Addresses', href: '/whitelist-email-addresses' },
    ],
  },
  {
    label: 'Insights',
    icon: <BarChart3 className="h-4 w-4" />,
    children: [
      { label: 'Captions Insights', href: '/insights' },
      { label: 'User Insights', href: '/insights/user' },
      { label: 'Sharing Insights', href: '/insights/sharing' },
    ],
  },
  {
    label: 'Demographics',
    icon: <ContactRound className="h-4 w-4" />,
    children: [
      { label: 'Questions', href: '/demographics' },
      { label: 'Answers', href: '/demographics/answers' },
      { label: 'Question–Answer Mapping', href: '/demographics/mappings' },
      { label: 'User Responses', href: '/demographics/responses' },
    ],
  },
  {
    label: 'QR Generator',
    href: '/qr-generator',
    icon: <QrCode className="h-4 w-4" />,
  },
  {
    label: 'Content Moderation',
    icon: <ListChecks className="h-4 w-4" />,
    children: [
      { label: 'Reported Captions', href: '/reported-captions' },
      { label: 'Reported Images', href: '/reported-images' },
    ],
  },
  {
    label: 'Bug Reports',
    href: '/bug-reports',
    icon: <Bug className="h-4 w-4" />,
  },
]

function isActive(pathname: string, href?: string, exact = false) {
  if (!href) return false
  if (href === '/caption-jobs' && pathname.startsWith('/caption-job/')) return true
  if (href === '/humor-flavors' && pathname.startsWith('/humor-flavor/'))
    return true
  if (
    href === '/studies' &&
    pathname.startsWith('/study/') &&
    !pathname.startsWith('/study/generate-captions') &&
    !pathname.startsWith('/study/wizard')
  ) {
    return true
  }
  if (href === '/study-image-sets' && pathname.startsWith('/study-image-set/'))
    return true
  if (href === '/captions' && pathname.startsWith('/caption/')) return true
  if (
    href === '/captions' &&
    pathname.startsWith('/user/') &&
    pathname.endsWith('/captions')
  )
    return true
  if (href === '/caption-requests' && pathname.startsWith('/caption-request/'))
    return true
  if (
    href === '/llm-prompt-chains' &&
    pathname.startsWith('/llm-prompt-chain/')
  )
    return true
  if (href === '/images' && pathname.startsWith('/image/')) return true
  if (
    href === '/images' &&
    pathname.startsWith('/user/') &&
    pathname.endsWith('/images')
  )
    return true
  if (exact) return pathname === href
  return pathname === href || pathname.startsWith(href)
}

export default function Sidebar() {
  const pathname = usePathname()
  const { theme, setTheme } = useTheme()
  const [collapsed, setCollapsed] = useState(false)
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({})
  const [showLogout, setShowLogout] = useState(false)
  const publicRoutes = ['/', '/sign-in', '/forgot-password', '/reset-password']
  const isAdminRoute =
    Boolean(pathname) &&
    !publicRoutes.includes(pathname) &&
    !pathname.startsWith('/auth')

  useEffect(() => {
    const c = localStorage.getItem('sidebar.collapsed');
    const o = localStorage.getItem('sidebar.groups');
    if (c) setCollapsed(c === 'true');
    if (o) setOpenGroups(JSON.parse(o));

    const handleState = (e: Event) => {
      const d = (e as CustomEvent).detail as { collapsed?: boolean };
      if (typeof d?.collapsed === 'boolean') {
        setCollapsed(d.collapsed);
      }
    };
    window.addEventListener('sidebar:state', handleState as EventListener);
    return () => {
      window.removeEventListener('sidebar:state', handleState as EventListener);
    };
  }, []);

  useEffect(() => {
    localStorage.setItem('sidebar.collapsed', String(collapsed))
    window.dispatchEvent(
      new CustomEvent('sidebar:state', { detail: { collapsed } })
    )
  }, [collapsed])

  useEffect(() => {
    localStorage.setItem('sidebar.groups', JSON.stringify(openGroups))
  }, [openGroups])

  useEffect(() => {
    NAV.forEach((item) => {
      if (item.children?.some((ch) => isActive(pathname, ch.href))) {
        setOpenGroups((prev) => ({ ...prev, [item.label]: true }))
      }
    })
  }, [pathname])

  useEffect(() => {
    const checkSession = async () => {
      try {
        const { user } = await checkAuth();
        setShowLogout(!!user || isAdminRoute);
      } catch (error) {
        console.error("Failed to fetch user session in Sidebar:", error);
        setShowLogout(isAdminRoute);
      }
    };
    checkSession();
  }, [isAdminRoute]);

  const toggleGroup = (label: string) =>
    setOpenGroups((prev) => ({ ...prev, [label]: !prev[label] }))

  return (
    <aside
      className={cn(
        'fixed left-0 top-14 z-30 h-[calc(100vh-3.5rem)] flex flex-col border-r bg-sidebar text-sidebar-foreground border-sidebar-border',
        collapsed ? 'w-16' : 'w-64',
        'transition-[width] duration-200'
      )}
    >
      {/* nav */}
      <nav
        className="flex-1 px-2 py-4 space-y-1 overflow-y-auto custom-scroll"
        style={{
          maxHeight: 'calc(100vh - 112px)',
        }}
      >
        {NAV.map((item) => {
          const activeParent =
            isActive(pathname, item.href) ||
            item.children?.some((ch) => isActive(pathname, ch.href))
          const open = openGroups[item.label] ?? false

          // leaf link
          if (!item.children) {
            const active = isActive(pathname, item.href)
            return (
              <Link
                key={item.label}
                href={item.href!}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium',
                  'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                  active
                    ? 'bg-primary/10 text-sidebar-accent-foreground'
                    : 'text-sidebar-foreground/70'
                )}
              >
                {/* active accent bar */}
                <span
                  className={cn(
                    'absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-full',
                    active ? 'bg-primary' : 'bg-transparent'
                  )}
                />
                <span className="shrink-0">{item.icon}</span>
                {!collapsed && <span className="truncate">{item.label}</span>}
              </Link>
            )
          }

          // auto-expand if sidebar is collapsed
          return (
            <div key={item.label}>
              <button
                onClick={() => {
                  if (collapsed) {
                    setCollapsed(false)
                    setOpenGroups((prev) => ({ ...prev, [item.label]: true }))
                    return
                  }
                  toggleGroup(item.label)
                }}
                aria-expanded={open}
                className={cn(
                  'w-full relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium',
                  'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                  activeParent
                    ? 'bg-primary/10 text-sidebar-accent-foreground'
                    : 'text-sidebar-foreground/80'
                )}
              >
                <span
                  className={cn(
                    'absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-full',
                    activeParent ? 'bg-primary' : 'bg-transparent'
                  )}
                />
                <span className="shrink-0">{item.icon}</span>
                {!collapsed && (
                  <>
                    <span className="flex-1 text-left truncate">
                      {item.label}
                    </span>
                    <span
                      className={cn(
                        'transition-transform',
                        open ? 'rotate-180' : ''
                      )}
                    >
                      <ChevronDown className="h-4 w-4" />
                    </span>
                  </>
                )}
              </button>

              {!collapsed && open && (
                <div className="ml-7 mt-1 space-y-1 border-l pl-3 border-sidebar-border">
                  {item.children.map((ch) => {
                    const chActive = isActive(pathname, ch.href, true)
                    return (
                      <Link
                        key={ch.label}
                        href={ch.href!}
                        aria-current={chActive ? 'page' : undefined}
                        className={cn(
                          'block rounded-md px-2 py-1.5 text-sm',
                          'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                          chActive
                            ? 'bg-primary/10 text-sidebar-accent-foreground'
                            : 'text-sidebar-foreground/70'
                        )}
                      >
                        {ch.label}
                      </Link>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </nav>

      <div
        className={cn(
          'mt-auto border-t border-sidebar-border px-3 py-4',
          collapsed ? 'flex flex-col items-center gap-3' : 'flex flex-col gap-3'
        )}
      >
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              className={cn('gap-2', collapsed ? '' : 'w-full justify-start')}
              size={collapsed ? 'icon' : 'default'}
              variant="secondary"
              aria-label="Open settings menu"
            >
              <Settings className="h-4 w-4" />
              {collapsed ? (
                <span className="sr-only">Settings</span>
              ) : (
                <span>Settings</span>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align={collapsed ? 'center' : 'start'}
            side="top"
            className="w-72 p-2"
          >
            <div className="px-2 py-2">
              <TimezoneSelect />
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Theme</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={theme ?? 'system'}
              onValueChange={(value) => setTheme(value)}
            >
              <DropdownMenuRadioItem value="light">
                Light Mode
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="dark">
                Dark Mode
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="system">
                System Default
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
            {showLogout && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={async () => {
                    await signOutAction()
                    setShowLogout(false)
                  }}
                  className="text-destructive focus:text-destructive"
                >
                  <LogOut className="h-4 w-4" />
                  Log Out
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <style jsx global>{`
        .custom-scroll::-webkit-scrollbar {
          width: 8px;
        }
        .custom-scroll::-webkit-scrollbar-thumb {
          background: rgba(120, 120, 120, 0.3);
          border-radius: 8px;
        }
        .custom-scroll:hover::-webkit-scrollbar-thumb {
          background: rgba(120, 120, 120, 0.5);
        }
      `}</style>
    </aside>
  )
}
