'use client'

import { usePathname, useRouter } from 'next/navigation';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import Sidebar from '@/components/ui/sidebar';
import { useSidebarOffset } from '@/hooks/useSidebarOffset';
import { Menu as MenuIcon, LogOut, Sun, Moon, Search, Bell, User } from 'lucide-react';
import { AppSwitcher } from '@/components/AppSwitcher';
import { cn } from '@/lib/utils';
import { useTheme } from 'next-themes';
import { signOutAction } from '@/app/actions';
import { Button } from '@/components/ui/button';
import { useEffect, useState, useRef } from 'react';
import { checkAuth } from '@/utils/auth';
import TimezoneSelect from '@/components/TimezoneSelect';

import ImagesPage from './images/page'
import ImagesClient from './images/ImagesClient'
import ImageDetailsPage from '@/components/image-details/ImageDetailsPage'
import LlmPromptChainDetailsPage from '@/components/llm-prompt-chains/LlmPromptChainDetailsPage'

import Overview from './overview/page';
import Users from './users/page';
import BulkPermissionsPage from './users/bulk-permissions/page';
import ClientsPage from './clients/page';
import UploadCommonUsePage from './common-use/upload/page';
import ImageCategories from './image-categories/page';
import Communities from './communities/page';
import CommunityContextsPage from './community-contexts/page';
import CommunityContextTagsPage from './community-context-tags/page';
import HumorFlavors from './humor-flavors/page';
import HumorFlavorStepsPage from './humor-flavor/[humorFlavorId]/steps/page';
import HumorThemesPage from './humor-themes/page';
import HumorMixPage from './humor-mix/page';
import ImageHumorPotentialPromptsPage from './image-humor-potential-prompts/page';
import ImageHumorPotentialPromptDetailPage from './image-humor-potential-prompts/[promptId]/page';
import LlmModels from './llm-models/page';
import LlmProvidersPage from './llm-providers/page';
import LlmPromptChainsPage from './llm-prompt-chains/page';
import LlmResponses from './llm-responses/page';
import CaptionsPage from './captions/page';
import CaptionDetailsPage from '@/components/caption-details/CaptionDetailsPage';
import CaptionJobsPage from '@/components/caption-jobs/CaptionJobsPage';
import ExternalImageReplacementJobsPage from '@/components/external-image-replacement-jobs/ExternalImageReplacementJobsPage';
import ExternalImageReplacementAlerts from '@/components/external-image-replacement-jobs/ExternalImageReplacementAlerts';
import CaptionJobDetailsPage from '@/components/caption-jobs/CaptionJobDetailsPage';
import CaptionRequestsPage from '@/components/caption-requests/CaptionRequestsPage';
import CaptionRequestDetailsPage from '@/components/caption-requests/CaptionRequestDetailsPage';
import UserCaptionsPage from '@/components/captions/UserCaptionsPage';
import StudiesPage from './studies/page';
import StudyDetailPage from './study/[studyId]/page';
import StudyImageSetsPage from './study-image-sets/page';
import StudyImageSetDetailPage from './study-image-set/[studyImageSetId]/page';
import StudyCaptionMappingsPage from './study-caption-mappings/page';
import GenerateCaptionsPage from './study/generate-captions/page';
import StudyWizardPage from './study/wizard/page';
import QuickStudyPage from './study-quick/page';
import ExperimentsPage from './experiments/page';
import BugReports from './bug-reports/page';
import ReportedCaptionsPage from './reported-captions/page';
import TermsPage from './terms/page';
import TermTypesPage from './term-types/page';
import AllowedDomainsPage from './allowed-domains/page';
import WhitelistEmailAddressesPage from './whitelist-email-addresses/page';
import QRGeneratorPage from './qr-generator/page';
import ReportedImagesPage from './reported-images/page';
import CaptionExamplesPage from './caption-examples/page';
import AddHumorFlavorStepPage from '@/components/humor-flavor-steps/AddHumorFlavorStepPage';
import EditHumorFlavorStepPage from '@/components/humor-flavor-steps/EditHumorFlavorStepPage';

import UsersInsightsPage from './insights/user/page'
import InsightsPage from './insights/page'
import SharingInsightsPage from './insights/sharing/page'
import DemographicsPage from './demographics/page'
import DemographicAnswersPage from './demographics/answers/page'
import DemographicMappingsPage from './demographics/mappings/page'
import DemographicResponsesPage from './demographics/responses/page'

export default function Menu() {
  const pathname = usePathname();
  const offset = useSidebarOffset(); // 256 on SSR for admin pages, then live-updates
  const isAddHumorFlavorStepPage = pathname?.includes('/steps/new');
  const isEditHumorFlavorStepPage = pathname?.includes('/steps/') && pathname?.endsWith('/edit');
  const isHumorFlavorStepsPage = pathname?.startsWith('/humor-flavor/');
  const isImageHumorPotentialPromptDetailPage = pathname?.startsWith(
    '/image-humor-potential-prompts/'
  );
  const isStudyDetailPage = pathname?.startsWith('/study/');
  const isStudyImageSetDetailPage = pathname?.startsWith('/study-image-set/');
  const imageDetailId = pathname?.startsWith('/image/') ? pathname.split('/')[2] : null;
  const captionDetailId = pathname?.startsWith('/caption/') ? pathname.split('/')[2] : null;
  const captionJobId = pathname?.startsWith('/caption-job/') ? pathname.split('/')[2] : null;
  const captionRequestId = pathname?.startsWith('/caption-request/') ? pathname.split('/')[2] : null;
  const isBulkPermissionsPage = pathname?.startsWith('/users/bulk-permissions');
  const promptChainId = pathname?.startsWith('/llm-prompt-chain/')
    ? pathname.split('/')[2]
    : null
  const userSegments = pathname?.startsWith('/user/')
    ? pathname.split('/')
    : null
  const userId = userSegments?.[2] ?? null
  const userSection = userSegments?.[3] ?? null
  const isUserImagesPage = userSection === 'images'
  const isUserCaptionsPage = userSection === 'captions'

  const [showLogout, setShowLogout] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const { theme, setTheme } = useTheme();
  const router = useRouter();

  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSearchIndex, setSelectedSearchIndex] = useState(0);

  const notificationsRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const SEARCH_PAGES = [
    { label: 'Overview Dashboard', value: 'overview', category: 'Pages' },
    { label: 'Users & Permissions', value: 'users', category: 'Pages' },
    { label: 'Bulk Permissions', value: 'users-bulk-permissions', category: 'Pages' },
    { label: 'Images & Galleries', value: 'images', category: 'Content' },
    { label: 'Upload Images', value: 'common-use-upload', category: 'Content' },
    { label: 'External Image Replacement Jobs', value: 'external-image-replacement-jobs', category: 'Content' },
    { label: 'Image Categories', value: 'image-categories', category: 'Content' },
    { label: 'Communities List', value: 'communities', category: 'Content' },
    { label: 'Community Contexts', value: 'community-contexts', category: 'Content' },
    { label: 'Community Context Tags', value: 'community-context-tags', category: 'Content' },
    { label: 'Humor Flavors & Steps', value: 'humor-flavors', category: 'Humor Config' },
    { label: 'Humor Themes', value: 'humor-themes', category: 'Humor Config' },
    { label: 'Humor Mixes', value: 'humor-mix', category: 'Humor Config' },
    { label: 'LLM Prompt Chains', value: 'llm-prompt-chains', category: 'AI Tools' },
    { label: 'LLM Providers', value: 'llm-providers', category: 'AI Tools' },
    { label: 'LLM Models', value: 'llm-models', category: 'AI Tools' },
    { label: 'Reported Captions', value: 'reported-captions', category: 'Moderation' },
    { label: 'Reported Images', value: 'reported-images', category: 'Moderation' },
    { label: 'Caption Examples', value: 'caption-examples', category: 'Moderation' },
    { label: 'Caption Jobs', value: 'caption-jobs', category: 'AI Tools' },
    { label: 'Caption Requests', value: 'caption-requests', category: 'Moderation' },
    { label: 'Demographic Questions', value: 'demographics', category: 'Demographics' },
    { label: 'Demographic Answers', value: 'demographics-answers', category: 'Demographics' },
    { label: 'Demographic Mappings', value: 'demographics-mappings', category: 'Demographics' },
    { label: 'Demographic Responses', value: 'demographics-responses', category: 'Demographics' },
    { label: 'QR Code Generator', value: 'qr-generator', category: 'Utilities' },
  ];

  const filteredSearchPages = SEARCH_PAGES.filter(p =>
    p.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.category.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const publicRoutes = ['/', '/sign-in', '/forgot-password', '/reset-password'];
  const isAdminRoute =
    !!pathname && !publicRoutes.includes(pathname) && !pathname.startsWith('/auth');

  useEffect(() => {
    const checkSession = async () => {
      try {
        const { user } = await checkAuth();
        setShowLogout(!!user || isAdminRoute);
        if (user) {
          setUserEmail(user.email ?? null);
        }
      } catch (error) {
        console.error("Failed to fetch user session in Menu:", error);
        setShowLogout(isAdminRoute);
      }
    };
    checkSession();
  }, [isAdminRoute]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (notificationsRef.current && !notificationsRef.current.contains(event.target as Node)) {
        setNotificationsOpen(false);
      }
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setProfileOpen(false);
      }
      if (searchContainerRef.current && !searchContainerRef.current.contains(event.target as Node)) {
        setSearchOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen((open) => !open);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedSearchIndex((prev) =>
        prev < filteredSearchPages.length - 1 ? prev + 1 : 0
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedSearchIndex((prev) =>
        prev > 0 ? prev - 1 : filteredSearchPages.length - 1
      );
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filteredSearchPages[selectedSearchIndex]) {
        handleSelectPage(filteredSearchPages[selectedSearchIndex].value);
      }
    } else if (e.key === "Escape") {
      setSearchOpen(false);
    }
  };

  const handleSelectPage = (value: string) => {
    let path = `/${value}`;
    switch (value) {
      case 'overview': path = '/overview'; break;
      case 'users': path = '/users'; break;
      case 'users-bulk-permissions': path = '/users/bulk-permissions'; break;
      case 'images': path = '/images'; break;
      case 'common-use-upload': path = '/common-use/upload'; break;
      case 'image-categories': path = '/image-categories'; break;
      case 'communities': path = '/communities'; break;
      case 'community-contexts': path = '/community-contexts'; break;
      case 'community-context-tags': path = '/community-context-tags'; break;
      case 'humor-flavors': path = '/humor-flavors'; break;
      case 'humor-themes': path = '/humor-themes'; break;
      case 'humor-mix': path = '/humor-mix'; break;
      case 'llm-prompt-chains': path = '/llm-prompt-chains'; break;
      case 'llm-providers': path = '/llm-providers'; break;
      case 'llm-models': path = '/llm-models'; break;
      case 'reported-captions': path = '/reported-captions'; break;
      case 'reported-images': path = '/reported-images'; break;
      case 'caption-examples': path = '/caption-examples'; break;
      case 'caption-requests': path = '/caption-requests'; break;
      case 'demographics': path = '/demographics'; break;
      case 'demographics-answers': path = '/demographics/answers'; break;
      case 'demographics-mappings': path = '/demographics/mappings'; break;
      case 'demographics-responses': path = '/demographics/responses'; break;
      case 'qr-generator': path = '/qr-generator'; break;
      default: path = `/${value}`;
    }
    router.push(path);
    setSearchOpen(false);
    setSearchQuery("");
  };

  const toggleSidebar = () => {
    const current = localStorage.getItem('sidebar.collapsed') === 'true';
    const next = !current;
    localStorage.setItem('sidebar.collapsed', String(next));
    window.dispatchEvent(new CustomEvent('sidebar:state', { detail: { collapsed: next } }));
  };

  const getActiveTab = () => {
    if (!pathname) return 'overview'

    // Put more specific checks first
    if (isUserImagesPage) return 'images';
    if (isUserCaptionsPage) return 'captions';
    if (pathname.startsWith('/insights')) return 'insights';
    if (pathname.includes('demographics')) return 'demographics';
    if (pathname.includes('humor-mix')) return 'humor-mix';
    if (pathname.includes('humor-themes')) return 'humor-themes';
    if (pathname.includes('/humor-flavor/')) return 'humor-flavors';
    if (pathname.includes('humor-flavors')) return 'humor-flavors';
    if (pathname.includes('image-humor-potential-prompts')) return 'image-humor-potential-prompts';
    if (pathname.includes('community-context-tags')) return 'community-context-tags';
    if (pathname.startsWith('/llm-prompt-chain/')) return 'llm-prompt-chains';
    if (pathname.includes('llm-prompt-chains')) return 'llm-prompt-chains';
    if (pathname.includes('llm-providers')) return 'llm-providers';
    if (pathname.includes('llm-models')) return 'llm-models';
    if (pathname.includes('llm-responses')) return 'llm-responses';
    if (pathname.includes('overview')) return 'overview';
    if (isBulkPermissionsPage) return 'users-bulk-permissions';
    if (pathname.includes('clients')) return 'clients';
    if (pathname.includes('users')) return 'users';
    if (pathname.includes('sharing')) return 'sharing'; // keep if standalone route exists
    if (pathname.includes('image-categories')) return 'image-categories';
    if (pathname.startsWith('/image/')) return 'images';
    if (pathname === '/images' || pathname.startsWith('/images/')) return 'images';
    if (pathname === '/external-image-replacement-jobs') return 'external-image-replacement-jobs';
    if (pathname.startsWith('/common-use/upload')) return 'common-use-upload';
    if (pathname.includes('community-contexts')) return 'community-contexts';
    if (pathname.includes('communities')) return 'communities';
    if (pathname.includes('reported-captions')) return 'reported-captions';
    if (pathname.includes('/study/generate-captions')) return 'generate-captions';
    if (pathname.includes('/study/wizard')) return 'study-wizard';
    if (pathname.includes('study-quick')) return 'study-quick';
    if (pathname.includes('experiments')) return 'experiments';
    if (pathname.includes('study-caption-mappings')) return 'study-caption-mappings';
    if (pathname.startsWith('/study-image-set/')) return 'study-image-sets';
    if (pathname.includes('study-image-sets')) return 'study-image-sets';
    if (pathname === '/caption-jobs' || pathname.startsWith('/caption-job/')) return 'caption-jobs';
    if (pathname.startsWith('/caption-request/')) return 'caption-requests';
    if (pathname.includes('caption-requests')) return 'caption-requests';
    if (pathname.startsWith('/caption/')) return 'captions';
    if (pathname.includes('captions')) return 'captions';
    if (pathname.startsWith('/study/')) return 'studies';
    if (pathname.includes('studies')) return 'studies';
    if (pathname.includes('bug-reports')) return 'bug-reports';
    if (pathname.includes('term-types')) return 'term-types';
    if (pathname.includes('terms')) return 'terms';
    if (pathname.includes('whitelist-email-addresses')) return 'whitelist-email-addresses';
    if (pathname.includes('allowed-domains')) return 'allowed-domains';
    if (pathname.includes('qr-generator')) return 'qr-generator';
    if (pathname.includes('reported-images')) return 'reported-images';
    if (pathname.includes('caption-examples')) return 'caption-examples';
    return 'overview';
  };

  return (
    <div className="min-h-screen bg-transparent text-foreground flex flex-col">
      {/* Top Navbar */}
      <header className="fixed top-0 left-0 right-0 z-40 h-14 w-full flex items-center justify-between border-b bg-background px-4 shadow-sm select-none">
        {/* Left corner */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            aria-label="Toggle navigation"
            onClick={toggleSidebar}
            className="rounded-xl p-2 hover:bg-muted focus:outline-none focus:ring-2 focus:ring-primary/40"
          >
            <MenuIcon className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-red-500 to-rose-600 text-sm font-bold text-white shadow">
              CA
            </div>
            <span className="text-sm font-semibold text-foreground leading-none">Crack'd Admin</span>
          </div>
        </div>

        {/* Middle corner - Search Bar */}
        <div
          onClick={() => setSearchOpen(true)}
          className="hidden max-w-sm flex-1 md:block relative mx-4 cursor-pointer hover:opacity-80 transition-opacity"
        >
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
            <Search className="h-4 w-4 text-muted-foreground" />
          </div>
          <input
            type="text"
            placeholder="Search admin (Press ⌘K)"
            className="h-9 w-full rounded-lg border border-input bg-muted/40 pl-9 pr-3 text-xs focus:outline-none cursor-pointer"
            readOnly
          />
        </div>

        {/* Right corner accessories */}
        <div className="flex items-center gap-3">
          {/* Theme switcher */}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="rounded-lg"
          >
            <Sun className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
            <Moon className="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
            <span className="sr-only">Toggle theme</span>
          </Button>

          {/* Notifications */}
          <div className="relative" ref={notificationsRef}>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setNotificationsOpen(!notificationsOpen)}
              className="rounded-lg relative"
            >
              <Bell className="h-4 w-4" />
              <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-indigo-500 animate-pulse" />
            </Button>
            {notificationsOpen && (
              <div className="absolute right-0 top-full mt-2 w-80 origin-top-right overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-xl focus:outline-none z-50 dark:border-zinc-800 dark:bg-zinc-950 p-4">
                <div className="flex items-center justify-between border-b pb-2 mb-2 dark:border-zinc-800">
                  <span className="font-semibold text-xs text-foreground">Notifications</span>
                  <span className="text-[10px] text-indigo-500 font-medium cursor-pointer hover:underline">Mark all read</span>
                </div>
                <div className="space-y-3">
                  <div className="text-[11px] leading-tight">
                    <p className="font-semibold text-foreground">New Study request received</p>
                    <p className="text-muted-foreground mt-0.5">Study #124 has been requested by User 9</p>
                    <span className="text-[9px] text-muted-foreground">2 mins ago</span>
                  </div>
                  <div className="text-[11px] leading-tight">
                    <p className="font-semibold text-foreground">Image classification complete</p>
                    <p className="text-muted-foreground mt-0.5">14 images successfully tagged in category "Humor"</p>
                    <span className="text-[9px] text-muted-foreground">1 hour ago</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          <AppSwitcher />

          {/* Profile Dropdown */}
          <div className="relative" ref={profileRef}>
            <button
              onClick={() => setProfileOpen(!profileOpen)}
              className="flex h-9 w-9 items-center justify-center rounded-full border bg-muted focus:outline-none hover:bg-muted/80 shadow-sm transition-all overflow-hidden"
              aria-label="User menu"
            >
              <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-indigo-500 to-purple-600 text-xs font-semibold text-white">
                {userEmail ? userEmail.substring(0, 2).toUpperCase() : <User className="h-4 w-4" />}
              </div>
            </button>
            {profileOpen && (
              <div className="absolute right-0 top-full mt-2 w-64 origin-top-right overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-xl focus:outline-none z-50 dark:border-zinc-800 dark:bg-zinc-950 p-3">
                <div className="px-2 py-1.5 border-b mb-2 dark:border-zinc-800">
                  <p className="text-xs font-semibold text-foreground">Active Session</p>
                  <p className="text-[10px] text-muted-foreground truncate mt-0.5">{userEmail ?? "No account"}</p>
                </div>
                <div className="space-y-1.5">
                  <div className="px-2 py-1">
                    <span className="text-[10px] font-semibold text-muted-foreground block mb-1">Timezone</span>
                    <TimezoneSelect />
                  </div>
                  <div className="border-t my-1.5 dark:border-zinc-800" />
                  {showLogout && (
                    <button
                      onClick={async () => {
                        await signOutAction();
                        setProfileOpen(false);
                      }}
                      className="w-full text-left px-2 py-1.5 rounded-lg text-xs font-medium text-destructive hover:bg-destructive/10 transition flex items-center gap-2"
                    >
                      <LogOut className="h-3.5 w-3.5" />
                      Sign Out
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Command Search Overlay Modal */}
      {searchOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] px-4">
          <div className="fixed inset-0 bg-background/80 backdrop-blur-sm" onClick={() => setSearchOpen(false)} />
          <div
            ref={searchContainerRef}
            className="relative w-full max-w-lg rounded-xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-950 overflow-hidden flex flex-col max-h-[60vh] select-none"
          >
            <div className="flex items-center border-b px-3 dark:border-zinc-800">
              <Search className="h-4 w-4 mr-2 text-muted-foreground" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setSelectedSearchIndex(0);
                }}
                onKeyDown={handleSearchKeyDown}
                placeholder="Type a command or page name to search..."
                className="h-11 w-full bg-transparent text-xs focus:outline-none text-foreground"
                autoFocus
              />
              <button
                onClick={() => setSearchOpen(false)}
                className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground hover:bg-muted/80"
              >
                ESC
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {filteredSearchPages.length === 0 ? (
                <div className="text-center py-6 text-xs text-muted-foreground">
                  No matching pages or commands found.
                </div>
              ) : (
                filteredSearchPages.map((page, index) => {
                  const isSelected = index === selectedSearchIndex;
                  return (
                    <button
                      key={page.value}
                      onClick={() => handleSelectPage(page.value)}
                      className={cn(
                        "w-full text-left px-3 py-2 rounded-lg text-xs font-medium flex items-center justify-between transition-colors",
                        isSelected
                          ? "bg-primary text-primary-foreground shadow"
                          : "text-foreground hover:bg-muted"
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <span>{page.label}</span>
                      </div>
                      <span className={cn(
                        "text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded",
                        isSelected ? "bg-primary-foreground/20 text-primary-foreground" : "bg-muted text-muted-foreground"
                      )}>
                        {page.category}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* Body Container */}
      <div className="flex flex-1 pt-14">
        <Sidebar />

        {/* main content */}
        <main
          className="flex-1 px-4 sm:px-6 lg:px-8 py-6"
          style={{ marginLeft: `${offset}px`, width: `calc(100% - ${offset}px)`, transition: 'margin-left 0.2s' }}
        >
          <div className="mx-auto max-w-screen-2xl">
            <ExternalImageReplacementAlerts />
            <div className="page-card">
              <Tabs value={getActiveTab()}>
              {/* Sidebar controls navigation; only content panes here */}
              <TabsContent value="overview">
                <Overview />
              </TabsContent>
              <TabsContent value="users">
                <Users />
              </TabsContent>
              <TabsContent value="users-bulk-permissions">
                <BulkPermissionsPage />
              </TabsContent>
              <TabsContent value="clients">
                <ClientsPage />
              </TabsContent>
              <TabsContent value="images">
                {isUserImagesPage && userId ? (
                  <ImagesClient
                    source="user-uploaded"
                    profileId={userId}
                    title="User Images"
                    subtitle={`Images uploaded by user ${userId}.`}
                  />
                ) : imageDetailId ? (
                  <ImageDetailsPage imageId={imageDetailId} />
                ) : (
                  <ImagesPage />
                )}
              </TabsContent>
              <TabsContent value="common-use-upload">
                <UploadCommonUsePage />
              </TabsContent>
              <TabsContent value="image-categories">
                <ImageCategories />
              </TabsContent>

              <TabsContent value="communities">
                <Communities />
              </TabsContent>
              <TabsContent value="community-contexts">
                <CommunityContextsPage />
              </TabsContent>
              <TabsContent value="community-context-tags">
                <CommunityContextTagsPage />
              </TabsContent>
              <TabsContent value="humor-flavors">
                {isAddHumorFlavorStepPage ? (
                  <AddHumorFlavorStepPage />
                ) : isEditHumorFlavorStepPage ? (
                  <EditHumorFlavorStepPage />
                ) : isHumorFlavorStepsPage ? (
                  <HumorFlavorStepsPage />
                ) : (
                  <HumorFlavors />
                )}
              </TabsContent>
              <TabsContent value="humor-themes"><HumorThemesPage /></TabsContent>
              <TabsContent value="humor-mix"><HumorMixPage /></TabsContent>
              <TabsContent value="image-humor-potential-prompts">
                {isImageHumorPotentialPromptDetailPage ? (
                  <ImageHumorPotentialPromptDetailPage />
                ) : (
                  <ImageHumorPotentialPromptsPage />
                )}
              </TabsContent>
              <TabsContent value="llm-models"><LlmModels /></TabsContent>
              <TabsContent value="llm-providers"><LlmProvidersPage /></TabsContent>
              <TabsContent value="llm-prompt-chains">
                {promptChainId ? (
                  <LlmPromptChainDetailsPage
                    promptChainId={Number(promptChainId)}
                  />
                ) : (
                  <LlmPromptChainsPage />
                )}
              </TabsContent>
              <TabsContent value="llm-responses">
                <LlmResponses />
              </TabsContent>
              <TabsContent value="caption-examples">
                <CaptionExamplesPage />
              </TabsContent>
              <TabsContent value="caption-jobs">
                {captionJobId ? <CaptionJobDetailsPage jobId={captionJobId} /> : <CaptionJobsPage />}
              </TabsContent>
              <TabsContent value="external-image-replacement-jobs"><ExternalImageReplacementJobsPage /></TabsContent>
              <TabsContent value="caption-requests">
                {captionRequestId ? (
                  <CaptionRequestDetailsPage
                    captionRequestId={Number(captionRequestId)}
                  />
                ) : (
                  <CaptionRequestsPage />
                )}
              </TabsContent>
              <TabsContent value="captions">
                {isUserCaptionsPage && userId ? (
                  <UserCaptionsPage userId={userId} />
                ) : captionDetailId ? (
                  <CaptionDetailsPage captionId={captionDetailId} />
                ) : (
                  <CaptionsPage />
                )}
              </TabsContent>
              <TabsContent value="studies">
                {isStudyDetailPage ? <StudyDetailPage /> : <StudiesPage />}
              </TabsContent>
              <TabsContent value="study-image-sets">
                {isStudyImageSetDetailPage ? (
                  <StudyImageSetDetailPage />
                ) : (
                  <StudyImageSetsPage />
                )}
              </TabsContent>
              <TabsContent value="study-caption-mappings"><StudyCaptionMappingsPage /></TabsContent>
              <TabsContent value="generate-captions"><GenerateCaptionsPage /></TabsContent>
              <TabsContent value="study-wizard"><StudyWizardPage /></TabsContent>
              <TabsContent value="study-quick"><QuickStudyPage /></TabsContent>
              <TabsContent value="experiments"><ExperimentsPage /></TabsContent>

              <TabsContent value="insights">
                {pathname === '/insights/user' ? (
                  <UsersInsightsPage />
                ) : pathname === '/insights/sharing' ? (
                  <SharingInsightsPage />
                ) : (
                  <InsightsPage />
                )}
              </TabsContent>

              <TabsContent value="demographics">
                {pathname === '/demographics/answers' ? (
                  <DemographicAnswersPage />
                ) : pathname === '/demographics/mappings' ? (
                  <DemographicMappingsPage />
                ) : pathname === '/demographics/responses' ? (
                  <DemographicResponsesPage />
                ) : (
                  <DemographicsPage />
                )}
              </TabsContent>

              <TabsContent value="bug-reports">
                <BugReports />
              </TabsContent>
              <TabsContent value="terms">
                <TermsPage />
              </TabsContent>
              <TabsContent value="term-types">
                <TermTypesPage />
              </TabsContent>
              <TabsContent value="allowed-domains">
                <AllowedDomainsPage />
              </TabsContent>
              <TabsContent value="whitelist-email-addresses">
                <WhitelistEmailAddressesPage />
              </TabsContent>
              <TabsContent value="qr-generator">
                <QRGeneratorPage />
              </TabsContent>
              <TabsContent value="reported-captions">
                <ReportedCaptionsPage />
              </TabsContent>
              <TabsContent value="reported-images">
                <ReportedImagesPage />
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </main>
      </div>
    </div>
  )
}
