// A titled block: serif heading over a ruled line, with an optional count and actions on the right
function Section({ title, count, actions, className = '', ref, children }) {
  return (
    <section className={`section ${className}`} ref={ref}>
      <header className="section-head">
        <h2>
          {title}
          {count !== undefined && <span className="section-count">{count}</span>}
        </h2>
        {actions && <div className="section-actions">{actions}</div>}
      </header>
      {children}
    </section>
  )
}
export default Section
