import { useCallback, useEffect, useMemo, useState } from 'react'
import JobTrackerBox from './components/JobTrackerBox.jsx'
import './App.css'
import ResumeBox from './components/ResumeBox.jsx'
import ConnectedAccount from './components/ConnectedAccount.jsx'
import Interviews from './components/Interviews.jsx'
import FoundJobs from './components/FoundJobs.jsx'
import AppPasswordDialog from './components/AppPasswordDialog.jsx'
import OutlookDialog from './components/OutlookDialog.jsx'
import StatsBar from './components/StatsBar.jsx'
import JobDialog from './components/JobDialog.jsx'
import DataTools from './components/DataTools.jsx'
import StoryBank from './components/StoryBank.jsx'
import StoryDialog from './components/StoryDialog.jsx'
import EmailDialog from './components/EmailDialog.jsx'
import { groupJobs } from './lib/findJobs.js'
import { useInboxes } from './lib/useInboxes.js'
import { useStore } from './lib/useStore.js'
import { buildJobs, computeStats, isBeforeStage, jobsToCsv, normalizeCompany } from './lib/jobs.js'
import { exportBackup, importBackup } from './lib/backup.js'
import { downloadFile } from './lib/download.js'
import { linkedInJobId, parseLinkedInApplications } from './lib/linkedinImport.js'
import { fromDateInput } from './lib/format.js'

function App() {
  const inboxes = useInboxes()
  const { jobEmails } = inboxes
  // Which connect dialog is open: { provider, email?, remember? }, or null
  const [connectDialog, setConnectDialog] = useState(null)
  // undefined = closed, null = adding a new job, otherwise the job being edited
  const [editingJob, setEditingJob] = useState(undefined)
  const [editingJobTab, setEditingJobTab] = useState('details')
  // Same pattern for the story dialog
  const [editingStory, setEditingStory] = useState(undefined)
  const [interviewDraft, setInterviewDraft] = useState(null)
  // The job whose emails are open in the email viewer
  const [viewingJob, setViewingJob] = useState(null)
  const viewingEmails = useMemo(
    () => (viewingJob ? viewingJob.emailIds.map((id) => jobEmails.find((e) => e.id === id)).filter(Boolean) : []),
    [viewingJob, jobEmails],
  )
  const interviews = useStore('interviews')
  const resumes = useStore('resumes')
  const jobDetails = useStore('jobDetails')
  const stories = useStore('stories')

  const allJobs = useMemo(() => buildJobs(groupJobs(jobEmails), jobDetails.items), [jobEmails, jobDetails.items])
  const jobs = useMemo(() => allJobs.filter((job) => !job.hidden), [allJobs])
  const hiddenJobs = useMemo(() => allJobs.filter((job) => job.hidden), [allJobs])
  // Last removal, offered as "Undo" for a few seconds
  const [undo, setUndo] = useState(null)

  useEffect(() => {
    if (!undo) return
    const timer = setTimeout(() => setUndo(null), 10_000)
    return () => clearTimeout(timer)
  }, [undo])
  const sortedInterviews = useMemo(
    () => [...interviews.items].sort((a, b) => a.dateTime.localeCompare(b.dateTime)),
    [interviews.items],
  )
  const sortedResumes = useMemo(() => [...resumes.items].sort((a, b) => b.addedAt - a.addedAt), [resumes.items])
  const stats = useMemo(() => computeStats(jobs, interviews.items), [jobs, interviews.items])
  const sortedStories = useMemo(() => [...stories.items].sort((a, b) => a.title.localeCompare(b.title)), [stories.items])
  // How many jobs' prep uses each story
  const storyUsage = useMemo(() => {
    const usage = new Map()
    for (const job of jobs) {
      for (const id of job.prep.storyIds) usage.set(id, (usage.get(id) || 0) + 1)
    }
    return usage
  }, [jobs])
  const storeError = interviews.error || resumes.error || jobDetails.error || stories.error

  // Both providers open a how-to dialog first
  function handleConnect(provider) {
    setConnectDialog({ provider })
  }

  // "Refresh now" checks quietly when it can, and asks for the password or a sign-in when it can't
  function handleRefreshAccount(account) {
    const kind = account.state?.kind
    if (account.provider === 'gmail' && (kind === 'needs_password' || !account.lastScanAt)) {
      setConnectDialog({ provider: 'gmail', email: account.email, remember: account.remembered })
    } else if (account.provider === 'outlook' && (kind === 'sign_in_required' || !account.lastScanAt)) {
      setConnectDialog({ provider: 'outlook' })
    } else {
      inboxes.refresh(account)
    }
  }

  // Stores the user's edits for a job; picking a new stage records when, so a newer email can override it
  function saveJobDetails(job, changes) {
    const record = { ...(jobDetails.items.find((d) => d.id === job.id) || { id: job.id }), ...changes }
    if (changes.stage && changes.stage !== job.stage) record.stageSetAt = Date.now()
    return jobDetails.save(record)
  }

  function openJob(job, tab = 'details') {
    setEditingJobTab(tab)
    setEditingJob(job)
  }

  function handleSaveJob(values) {
    const { company, position, stage, notes, resumeId, prep, offer } = values
    if (!editingJob) {
      return jobDetails.save({
        id: `manual:${crypto.randomUUID()}`,
        manual: true,
        company, position, stage, notes, resumeId, prep, offer,
        date: fromDateInput(values.date).getTime(),
      })
    }
    const changes = { company, position, stage, notes, resumeId, prep, offer }
    if (editingJob.manual) changes.date = fromDateInput(values.date).getTime()
    return saveJobDetails(editingJob, changes)
  }

  // Jobs from email can't be deleted (the next scan would bring them back), so they're hidden instead
  function handleDeleteJob(job) {
    return job.manual ? jobDetails.remove(job.id) : saveJobDetails(job, { hidden: true })
  }

  // The trash button: removes straight away and offers Undo instead of asking first
  async function handleRemoveJob(job) {
    if (job.manual) {
      const record = jobDetails.items.find((d) => d.id === job.id)
      await jobDetails.remove(job.id)
      setUndo({ message: `Deleted ${job.company}.`, restore: () => jobDetails.save(record) })
    } else {
      await saveJobDetails(job, { hidden: true })
      setUndo({
        message: `Removed ${job.company}. It won't come back on later scans.`,
        restore: () => saveJobDetails(job, { hidden: false }),
      })
    }
  }

  async function handleUndo() {
    const { restore } = undo
    setUndo(null)
    await restore()
  }

  // Pre-fills the interview form, including a date and time read from the job's emails
  function handleAddInterviewForJob(job) {
    const contact = job.extracted?.contact
    setInterviewDraft({
      company: job.company,
      position: job.position,
      jobId: job.id,
      dateTime: job.extracted?.interviewAt || '',
      notes: contact ? `With ${contact.name} (${contact.email})` : '',
    })
  }

  const clearInterviewDraft = useCallback(() => setInterviewDraft(null), [])

  async function handleSaveInterview(interview) {
    await interviews.save(interview)
    const job = interview.jobId && jobs.find((j) => j.id === interview.jobId)
    if (job && isBeforeStage(job.stage, 'interview')) await saveJobDetails(job, { stage: 'interview' })
  }

  // Adds LinkedIn applications as jobs, skipping ones already tracked (same company and position)
  async function handleLinkedInImport(files) {
    const applications = []
    for (const file of files) applications.push(...parseLinkedInApplications(await file.text()))

    const lower = (text) => (text || '').trim().toLowerCase()
    const alreadyTracked = (app) =>
      jobDetails.items.some((d) => d.id === linkedInJobId(app)) ||
      allJobs.some((job) =>
        normalizeCompany(job.company) === normalizeCompany(app.company) &&
        (!job.position || lower(job.position) === lower(app.position)))

    const records = applications.filter((app) => !alreadyTracked(app)).map((app) => ({
      id: linkedInJobId(app),
      manual: true,
      source: 'linkedin',
      company: app.company,
      position: app.position,
      stage: 'application_received',
      notes: '',
      resumeId: resumes.items.find((r) => app.resumeName && lower(r.name) === lower(app.resumeName))?.id || null,
      date: app.date.getTime(),
      link: app.link,
    }))
    // The same application can appear twice in one file
    const unique = [...new Map(records.map((r) => [r.id, r])).values()]
    await jobDetails.saveMany(unique)

    const skipped = applications.length - unique.length
    return `Imported ${unique.length} LinkedIn applications${skipped ? ` (${skipped} already tracked)` : ''}.`
  }

  function handleAddResume(file) {
    return resumes.save({ id: crypto.randomUUID(), name: file.name, size: file.size, addedAt: Date.now(), file })
  }

  async function handleImport(file) {
    await importBackup(file)
    window.location.reload()
  }

  function handleExportCsv() {
    downloadFile(`jobs-${new Date().toISOString().slice(0, 10)}.csv`, jobsToCsv(jobs, resumes.items), 'text/csv')
  }

  return (
    <div className="app-shell">
      <JobTrackerBox onConnect={handleConnect} busy={inboxes.busy} />
      {connectDialog?.provider === 'gmail' && (
        <AppPasswordDialog
          provider="gmail"
          initialEmail={connectDialog.email}
          initialRemember={connectDialog.remember}
          onSubmit={inboxes.scanGmail}
          onClose={() => setConnectDialog(null)}
        />
      )}
      {connectDialog?.provider === 'outlook' && (
        <OutlookDialog onContinue={inboxes.scanOutlook} onClose={() => setConnectDialog(null)} />
      )}
      {editingJob !== undefined && (
        <JobDialog
          job={editingJob}
          initialTab={editingJobTab}
          resumes={sortedResumes}
          interviews={sortedInterviews}
          stories={sortedStories}
          onSave={handleSaveJob}
          onDelete={() => handleDeleteJob(editingJob)}
          onAddInterview={() => handleAddInterviewForJob(editingJob)}
          onFollowedUp={() => saveJobDetails(editingJob, { followedUpAt: Date.now() })}
          onViewEmail={setViewingJob}
          onClose={() => setEditingJob(undefined)}
        />
      )}
      {viewingJob && (
        <EmailDialog
          job={viewingJob}
          emails={viewingEmails}
          onAddInterview={(email) => {
            // Use the time from the email being read, and close the job dialog if it's open underneath
            setEditingJob(undefined)
            handleAddInterviewForJob({ ...viewingJob, extracted: { ...viewingJob.extracted, ...email.details } })
          }}
          onEditJob={editingJob === undefined ? () => openJob(viewingJob) : undefined}
          onClose={() => setViewingJob(null)}
        />
      )}
      {editingStory !== undefined && (
        <StoryDialog
          story={editingStory}
          onSave={stories.save}
          onDelete={stories.remove}
          onClose={() => setEditingStory(undefined)}
        />
      )}
      <StatsBar stats={stats} />
      <main className="workspace">
        <FoundJobs
          jobs={jobs}
          hiddenJobs={hiddenJobs}
          interviews={sortedInterviews}
          onRemoveJob={handleRemoveJob}
          onRestoreJob={(job) => saveJobDetails(job, { hidden: false })}
          undo={undo}
          onUndo={handleUndo}
          onOpenJob={openJob}
          onNewJob={() => openJob(null)}
          onStageChange={(job, stage) => saveJobDetails(job, { stage })}
          onAddInterview={handleAddInterviewForJob}
          onViewEmail={setViewingJob}
          onImportLinkedIn={handleLinkedInImport}
        />
        <aside className="sidebar">
          <Interviews
            interviews={sortedInterviews}
            onSave={handleSaveInterview}
            onDelete={interviews.remove}
            draft={interviewDraft}
            onDraftUsed={clearInterviewDraft}
          />
          <ConnectedAccount
            accounts={inboxes.accountList}
            status={inboxes.status || storeError}
            now={inboxes.now}
            onRefresh={handleRefreshAccount}
            onForgetPassword={inboxes.forgetSavedPassword}
            onDisconnect={inboxes.removeAccount}
          />
          <ResumeBox resumes={sortedResumes} onAdd={handleAddResume} onDelete={resumes.remove} />
          <StoryBank stories={sortedStories} usage={storyUsage} onAdd={() => setEditingStory(null)} onOpen={setEditingStory} />
          <DataTools onExport={exportBackup} onExportCsv={handleExportCsv} onImport={handleImport} />
        </aside>
      </main>
    </div>
  )
}

export default App
