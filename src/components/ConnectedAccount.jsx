import Section from './Section.jsx'
import { REFRESH_MINUTES } from '../lib/useInboxes.js'
import { formatAgo } from '../lib/format.js'

const PROVIDER_LABELS = { gmail: 'Gmail', outlook: 'Outlook' }

// One line saying when the account was last checked and whether it will refresh on its own
function refreshLine(account, now) {
  const state = account.state
  if (state?.kind === 'refreshing') return 'Checking for new mail…'
  if (state?.kind === 'needs_password') return state.message || 'Enter the app password again to keep refreshing.'
  if (state?.kind === 'sign_in_required') return 'Sign in again to keep refreshing.'
  const checked = account.lastScanAt ? `Checked ${formatAgo(account.lastScanAt, now)}` : 'From an earlier scan'
  if (state?.kind === 'error') return `${checked}. Last refresh failed: ${state.message}`
  if (!account.lastScanAt) return `${checked}. Scan again to turn on refreshing.`
  return account.autoRefresh
    ? `${checked} · refreshes every ${REFRESH_MINUTES} min while open`
    : `${checked} · not refreshing (password not remembered)`
}

function ConnectedAccount({ accounts, status, now, onRefresh, onForgetPassword, onDisconnect }) {
  return (
    <Section title="Accounts" className="accounts">
      {accounts.length === 0 && <p className="empty">None yet. Use “Scan inbox” at the top to find job emails.</p>}
      <ul className="rows">
        {accounts.map((account) => {
          const needsAttention = ['needs_password', 'sign_in_required', 'error'].includes(account.state?.kind)
          return (
            <li key={account.email} className="row account-row">
              <div className="row-main">
                <span className="row-title">{PROVIDER_LABELS[account.provider] || 'Email'}</span>
                <span className="row-detail" title={account.email}>{account.email}</span>
                <span className={needsAttention ? 'account-refresh needs-attention' : 'account-refresh'}>
                  {refreshLine(account, now)}
                </span>
                <div className="inline-actions">
                  <button
                    className={needsAttention ? 'btn-text accent' : 'btn-text'}
                    onClick={() => onRefresh(account)}
                    disabled={account.state?.kind === 'refreshing'}
                  >
                    {{ sign_in_required: 'Sign in', needs_password: 'Enter password' }[account.state?.kind] || 'Refresh now'}
                  </button>
                  {account.remembered && (
                    <button className="btn-text" onClick={() => onForgetPassword(account.email)}>Forget password</button>
                  )}
                  <button className="btn-text danger" onClick={() => onDisconnect(account.email)}>Remove</button>
                </div>
              </div>
            </li>
          )
        })}
      </ul>
      {status && <p className="note" role="status">{status}</p>}
    </Section>
  )
}
export default ConnectedAccount
