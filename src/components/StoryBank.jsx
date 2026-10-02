import Section from './Section.jsx'

// Reusable STAR answers; jobs pick which ones to use in their Prep tab
function StoryBank({ stories, usage, onAdd, onOpen }) {
  return (
    <Section
      title="Story bank"
      count={stories.length}
      className="story-bank"
      actions={<button className="btn btn-small" onClick={onAdd}>Add</button>}
    >
      {stories.length === 0 && (
        <p className="empty">
          Write down 5–8 stories about your work once, then reuse them for “Tell me about a time…” questions.
        </p>
      )}
      <ul className="rows">
        {stories.map((story) => (
          <li key={story.id} className="row">
            <button className="row-main row-button" onClick={() => onOpen(story)}>
              <span className="row-title">{story.title}</span>
              {story.tags && <span className="row-detail">{story.tags}</span>}
            </button>
            {usage.get(story.id) > 0 && (
              <span className="row-meta" title="Jobs whose prep uses this story">
                {usage.get(story.id)} job{usage.get(story.id) === 1 ? '' : 's'}
              </span>
            )}
          </li>
        ))}
      </ul>
    </Section>
  )
}
export default StoryBank
