# UI conventions

This document defines the UI patterns for Itsyconnect. Every page and component must follow these conventions to ensure visual consistency. Custom styles are defined in `src/app/globals.css` under `@layer components` – use them instead of ad-hoc Tailwind classes.

## Typography

| Element | Style | Usage |
|---------|-------|-------|
| Page title | `text-2xl font-bold tracking-tight` | One per page, top of content area |
| Section title | `.section-title` class | Form field labels, card section headings |
| Body text | Default (inherits Geist 400 14px) | Paragraphs, descriptions |
| Muted text | `text-sm text-muted-foreground` | Secondary info, help text |

**Font stack:** Geist Sans (body), Geist Mono (code, text inputs). Set globally via `font-sans` on `<body>` in globals.css. Never override with system fonts.

### Custom CSS classes

Defined in `src/app/globals.css` under `@layer components`:

- **`.section-title`** – `text-base font-medium tracking-tight` (Geist 500, 16px). Use for all form section headings. Always on `<h3>` elements, never `<Label>`.

When adding new reusable styles, define them in globals.css as a component class rather than repeating Tailwind utilities.

## Icons

- **Phosphor icons** (`@phosphor-icons/react`) for all application icons
- lucide-react exists as a dependency but is only used internally by shadcn/ui components – never import it directly
- Default size: `size={16}`, use `size={20}` or `size={24}` for larger contexts

## Components

- **shadcn/ui 100%** – every interactive element must use a shadcn component
- Never build custom buttons, inputs, dropdowns, etc. from scratch

### Card padding

The shadcn `Card` component has `py-6 gap-6` built in. When using `CardContent` directly (no `CardHeader`), override the Card's padding to keep things tight:

```tsx
<Card className="gap-0 py-0">
  <CardContent className="space-y-2 py-0">
    {/* content */}
  </CardContent>
</Card>
```

The Card's default `py-6` is too generous for most list items and compact cards. Always zero it out and control padding from `CardContent` instead.

## Forms

### Text inputs inside cards

For multi-line text fields (like promotional text, what's new):

```tsx
<section className="space-y-2">
  <h3 className="section-title">Field name</h3>
  <Card>
    <CardContent className="py-3">
      <Textarea
        className="border-0 p-0 shadow-none focus-visible:ring-0 resize-none font-mono text-sm min-h-0"
      />
    </CardContent>
    <div className="flex items-center justify-end border-t px-4 py-2">
      <CharCount value={value} limit={limit} />
    </div>
  </Card>
</section>
```

Key rules:
- All text inputs use `font-mono text-sm` (Geist Mono)
- Textarea inside card: strip border, padding, shadow, ring – the card is the visual container
- Use `field-sizing-content` (shadcn default) instead of `rows` prop so the textarea auto-sizes
- `min-h-0` to remove the default 4rem minimum height
- Character count in a separate border-t footer row

### Section headings

- Use `<h3 className="section-title">` – not `<Label>`, not inline Tailwind
- `<Label>` is only for form controls that need accessible labelling (e.g. switch, checkbox)
- Sections use `space-y-2` for the heading-to-content gap. Use `space-y-6` or `space-y-8` between sections for breathing room.

## Layout

### Dashboard layout

The dashboard layout (`src/app/dashboard/layout.tsx`) wraps all page content in:

```tsx
<div className="flex flex-1 flex-col gap-4 pt-6 pb-8">
  <div className="mx-auto w-full max-w-6xl px-6">
    {children}
  </div>
</div>
```

**Content is capped at `max-w-5xl` (64rem / 1024px) and centred** with `px-6` so narrow viewports still get side padding. Pages must not override this width – it is set once in the layout.

### Page root patterns

Standard content pages use a simple container:

```tsx
<div className="space-y-6">
  <h1 className="text-2xl font-bold tracking-tight">Page title</h1>
  {/* content */}
</div>
```

### Loading and error states

Pages that fetch data asynchronously must handle loading and error states with centred feedback. The dashboard layout uses `flex flex-1 flex-col` all the way down, so `flex-1` on a loading container stretches it to fill the remaining vertical space.

**Critical rule:** The page's parent must be a flex column with `flex-1` for the spinner to centre vertically. If a sub-layout wraps children (e.g. the analytics tab layout), that wrapper must use `flex flex-1 flex-col` – not `space-y-*` – so the flex chain is unbroken.

```tsx
// Loading state – spinner centred in available space
if (loading) {
  return (
    <div className="flex flex-1 items-center justify-center">
      <Spinner className="size-6 text-muted-foreground" />
    </div>
  );
}

// Error state – message + retry button, also centred
if (error) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3">
      <p className="text-sm text-muted-foreground">{error}</p>
      <Button variant="outline" size="sm" onClick={refresh}>
        Retry
      </Button>
    </div>
  );
}
```

Key rules:
- Always use `flex flex-1 items-center justify-center` – never use `py-20` or fixed padding as a centering hack.
- The `flex-1` only works when every ancestor up to the dashboard layout is also a flex column with `flex-1`. Check the chain if the spinner isn't centring.
- Sub-layouts that wrap `{children}` must use `flex flex-1 flex-col gap-*` instead of `space-y-*` so child loading states can stretch.

### Sidebar

- Follows the shadcn sidebar-07 pattern (app switcher, grouped nav, footer)
- Nav groups: Release, Testing, Insights, Configure

### Header version picker

Version-scoped pages (store listing, screenshots, app review) show a `<HeaderVersionPicker>` in the dashboard header bar, after the breadcrumbs with a vertical separator. It renders:

- Platform select + version select (compact, `h-7 text-xs`)
- State indicator (coloured dot + label, hidden on mobile)
- "New version" button (outline) – also shown on the overview page
- "Save" button (primary, rightmost) – only on editable versions

The selected version is stored in the URL via `?version=` search param. Pages read it with `resolveVersion(appId, searchParams.get("version"))` from `mock-data.ts` instead of local state. When the header picker changes the version, the URL updates and the page re-renders.

## Electron drag regions

The app runs in an Electron window with `titleBarStyle: "hiddenInset"` – the native title bar is hidden and the traffic lights are inset into the content area. CSS classes `.drag` and `.no-drag` (defined in `globals.css`) map to `-webkit-app-region: drag/no-drag`.

### Rules

1. **Every screen must have a drag region** covering the top ~64px of the window so users can drag the window.
2. **Use `.drag` explicitly** on the drag container AND its inner wrapper div. Do not rely on CSS inheritance – always set `.drag` on every element in the chain.
3. **Use `.no-drag` on interactive elements only** – buttons, selects, links, inputs. Non-interactive text (breadcrumbs, labels) should inherit `.drag` from the parent.
4. **Sidebar header** uses `drag pt-8` to provide drag space above the app switcher (room for the traffic lights). The app switcher is wrapped in `no-drag`.

### Dashboard header pattern

```tsx
<header className="drag flex h-16 shrink-0 items-center ...">
  <div className="drag flex flex-1 items-center gap-2 px-4">
    <div className="no-drag flex items-center gap-2">
      {/* breadcrumbs, pickers – interactive */}
    </div>
    <div className="no-drag ml-auto flex items-center gap-2">
      {/* action buttons, theme toggle – interactive */}
    </div>
  </div>
</header>
```

### Full-page screen pattern (setup, onboarding)

For screens without a sidebar, use a fixed overlay:

```tsx
<div className="drag fixed inset-x-0 top-0 h-16" />
<div className="no-drag fixed top-4 right-4">
  <ThemeToggle />
</div>
```

## Colours

- Status dots use direct Tailwind colours: green-500, blue-500, yellow-500, amber-500, red-500
- Backgrounds use shadcn CSS variables (background, card, muted, etc.) – never hardcode colours for surfaces
- Accent blue gradient for app icons: `bg-gradient-to-b from-blue-500 to-blue-600`
