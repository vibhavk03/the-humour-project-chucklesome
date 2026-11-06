'use client'

import { useEffect, useState } from 'react'
import { StudyWizardService } from '@/services/study-wizard.service'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'
import type { Study } from '@/types/study'
import type { HumorFlavor } from '@/types/humor-flavor'
import StudyWizardClient, {
  type ImageSetWithCount,
} from './study-wizard-client'

export default function StudyWizardPage() {
  const { toast } = useToast()
  const [studies, setStudies] = useState<Study[]>([])
  const [flavors, setFlavors] = useState<HumorFlavor[]>([])
  const [existingImageSets, setExistingImageSets] = useState<
    ImageSetWithCount[]
  >([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [loadAttempt, setLoadAttempt] = useState(0)

  useEffect(() => {
    let alive = true

    const loadWizardData = async () => {
      setIsLoading(true)
      setLoadError(false)
      try {
        const data = await StudyWizardService.loadInitialData()
        if (!alive) return
        setStudies(data.studies)
        setFlavors(data.flavors)
        setExistingImageSets(data.imageSets)
      } catch (error) {
        console.error('Error loading study wizard:', error)
        if (!alive) return
        setLoadError(true)
        toast({
          title: 'Could not load the wizard',
          description: 'Please try again.',
          variant: 'destructive',
        })
      } finally {
        if (alive) setIsLoading(false)
      }
    }

    void loadWizardData()
    return () => {
      alive = false
    }
  }, [loadAttempt, toast])

  return (
    <div className="page-shell">
      <div className="page-header">
        <h1 className="page-title">Study Wizard</h1>
      </div>

      {isLoading ? (
        <div className="page-card py-16 text-center">
          <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">Loading wizard...</p>
        </div>
      ) : loadError ? (
        <div className="page-card py-16 text-center space-y-3">
          <p role="alert" className="text-sm text-muted-foreground">
            Could not load the wizard. Please try again.
          </p>
          <Button
            variant="outline"
            onClick={() => setLoadAttempt((attempt) => attempt + 1)}
          >
            Retry
          </Button>
        </div>
      ) : (
        <StudyWizardClient
          existingStudies={studies}
          flavors={flavors}
          existingImageSets={existingImageSets}
        />
      )}
    </div>
  )
}
