import { STAGE_LABELS } from '../lib/findJobs.js'

// Stage name with a small colour square; the colour is never the only cue
function Stage({ stage }) {
  return <span className="stage" data-stage={stage}>{STAGE_LABELS[stage]}</span>
}
export default Stage
