---
# Copy this file, rename it to your-session-slug.md (the filename becomes the URL),
# fill in the fields, and delete the ones you don't need.
title: 'Session title'
guest: 'Guest Name' # optional — delete this line for a Karl & Pete session with no guest
date: 2026-08-01T19:30:00+08:00
status: announced # announced → live → archived
draft: true # remove (or set false) to publish
youtubeId: '' # the YouTube video ID, e.g. dQw4w9WgXcQ — same ID works live and as replay
tracklist: # set list, in order — delete if not relevant
  - Track one
  - Track two
images:
  - src: /images/streams/example.jpg
    alt: 'What the image shows'
    caption: 'Optional caption'
audio:
  - src: /audio/streams/example.mp3
    title: 'Optional track title'
guestLinks:
  - label: 'Website'
    href: 'https://example.com'
# Post-hoc comment archive — delete if not relevant.
# After the stream, copy the comments from Facebook / Instagram and paste them
# under `raw:` below (indented, using the `|` block so line breaks are kept).
# The formatter cleans them into an attributed transcript on the session page —
# it strips "Reply / 2 likes / 3h" noise, or reads a CSV, or "Name: comment"
# lines. One block per platform. `format` is optional (auto by default).
commentTranscript:
  - platform: facebook # facebook | instagram | youtube | other
    raw: |
      Jane Doe
      Loved this one, please play it again
      3h · Reply · 2 likes
      Bob Marsh
      Encore!
      1h · Reply
  - platform: instagram
    format: auto # auto | csv | lines | blocks
    raw: |
      maria_k: gorgeous set tonight
      sam.listens: this is my new favourite
---

Session notes, the guest's poem or framing text, or anything else you want on the
page — this body is rendered below the video. Plain markdown.
