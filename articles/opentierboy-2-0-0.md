---
title: "OpenTierBoy 2.0.0: What Is New, and Why"
description: OpenTierBoy 2.0.0 is here, built from your feedback.
date: 2026-11-01
tags: [ opentierboy, release, version-2, tier-list, tier-maker, editor, zen, freeze-frame, copy-jutsu, byoi, the-finals, overwatch, open-source, privacy, security ]
ogImage: "/blog/2-0-0/og-2-0-0.webp"
---

# OpenTierBoy 2.0.0: What Is New, and Why

Hello, everyone!

OpenTierBoy began in 2024 as a small, free tier list maker for the games we play. Since then, you have sent bug
reports, ideas and a whole image set. Thank you for every one of them, and I appreciate it.

Version 2.0.0 is built mainly on your feedback, as well as one personal goal: making OpenTierBoy easier to maintain,
so it can keep going for years.

## A cleaner editor

![Naming a new OVERWATCH list, then dragging tanks into the rows](/blog/2-0-0/rank.gif)

Your list's title now sits at the top of the editor, with Add images, Zen and Share right beside it. In the old
editor, these tools hid behind icons with no names, so it's no surprise that several of you asked where they were.

Lists can grow now, too. Add row takes you up to 19 rows, which is plenty for the power-scaling lists some of you
asked for. Drag and drop is rebuilt as well to remove a pesky bug that prevented items from being arranged when the
row grew beyond one line.

If your list is long, Compact tiles (in Row options) fit more of it on the screen.

![Adding rows until the list has ten, then removing one](/blog/2-0-0/rows.gif)

![Dropping an item on the second line of a full row](/blog/2-0-0/multi-line-drag.gif)

## Your own images

One of the most requested features, and long-standing wishes is better custom image handling. Now you can drop image
files onto the editor or paste them, and you can drop a link to an image from the web.

![Uploading eight framework logos and ranking them](/blog/2-0-0/images.gif)

![Dropping an image from THE FINALS wiki onto the editor, then pasting an image address](/blog/2-0-0/link-drop-paste.gif)

Your uploads also stay in your browser between visits. In earlier versions, they were gone after a reload! However,
I'd still recommend saving it to a Freeze Frame for any list that matters to you, just in case the browser cleans it
up.

Images you add from the web now travel with your shared link, so your friends see them too. Images you upload stay on
your device, and hitting "Share" shows you how many of them there are.

![Opening Share on a list with one web image and one uploaded image, then copying the link as Markdown](/blog/2-0-0/share-panel.gif)

## Freeze Frame magic

Freeze Frame now draws your list as a clean card, and you can pick a landscape, square or portrait frame to suit
wherever you post it.

![Switching between the picture frames, then downloading the picture](/blog/2-0-0/freeze-frame-frames.gif)

My favorite change is hidden inside the picture. Now, each Freeze Frame you download saves your list, along with your
own images. Send it to a friend, and they can open it in OpenTierBoy and carry on editing.

![Opening a downloaded Freeze Frame and editing the list again](/blog/2-0-0/reopen.gif)

## Zen, for creators

Zen was originally created with the intention of fixing the layout while you ranked. It removes unnecessary scrolling
and distractions. The idea was that you would use this while screen-sharing, or while recording a video.

With 2.0.0, I've taken it a step further with some new features. A new Zen bar puts Back and Forward on screen, with a
step count, so your viewers can follow each change. Zen can also pick the order for you: "In order" and "Shuffle" hand
you one item at a time, and "Hide the queue" keeps the next pick a surprise.

![Ranking in Zen, stepping back and forward, then shuffling and hiding the queue](/blog/2-0-0/zen-bar.gif)

For videos and streams, Zen now comes in 16:9 for YouTube and 9:16 for Shorts and TikTok. There is also a green-screen
overlay: capture your browser window in OBS and key out the green, so your list sits on top of your stream.

![The same list in 16:9, in 9:16 and as an overlay](/blog/2-0-0/creator-layouts.gif)

## A fresh look, a fresh take

Since launch, keeping the image-sets up to date on my own has been hard. Every game update meant finding good images,
formatting and tagging them, publishing a new npm package, and then updating OpenTierBoy. Doing that for every set I
ambitiously added at launch led to burnout (I don't get paid for this!).

So I've trimmed the actively supported image-sets to two games I still play: THE FINALS and OVERWATCH. The older
image-sets are now legacy, and their tier list links still work. I'm also reworking the image-set template, so if
you'd like to add your own image-set, look out for the new format, coming soon™.

Furthermore, I've made some adjustments to the homepage UI. Have a look:

![Hovering THE FINALS and OVERWATCH on the home page, then scrolling to Recently viewed](/blog/2-0-0/home-page.gif)

I trimmed the themes for the same reason. There are now three modes: Light, Dark and System. Besides that, I've
changed the font.

![Switching to Dark mode, then to the Classic font](/blog/2-0-0/appearance.gif)

And if you're new to OpenTierBoy, a few short tips now appear once, right when they help, and one click hides them.

![The tips on a first visit](/blog/2-0-0/onboarding.gif)

## Links, new and past

We've updated how URLs are handled. Existing tier list URLs (from the previous versions) should still open, if not,
please report them! New links are also about a quarter shorter.

When you paste a link into a chat, its preview now shows your whole list, in the same style as Freeze Frame.

## Privacy and security

Still upholding the mission: OpenTierBoy still has no ads, and you still don't need an account. I still don't make
any money off of this, and I'm not here to sell you anything.

As always, your tier list is stored in the URL, and your uploads stay in your browser. This release also improves
security. The updated [Privacy Policy](https://www.opentierboy.com/privacy) and [Terms](https://www.opentierboy.com/terms)
take effect today.

## Built to last

A big goal of 2.0.0 was making OpenTierBoy easier to maintain, so it can keep growing with one maintainer. _I have
other projects that I'm working on and other responsibilities too!_

AI coding agents can now do much of that work, and coding with them is common across the software industry. For
example, Microsoft said in 2025 that AI writes up to 30% of its code, and Google said in April 2026 that AI writes
about three quarters of its new code. So I've improved the automated tests and checks, and I've restructured parts of
the codebase, so that agents can work on OpenTierBoy safely.

However, as many of you already know, building with AI agents comes with real trade-offs: inconsistencies, code drift
and errors, and the list goes on. Still, the bottom line is this:

1. OpenTierBoy is a free tool.
2. Its maintainers don't get paid, so it must be easy to maintain.
3. Anyone should be able to fork it and customize it to their liking.

Therefore, the agentic approach makes sense for OpenTierBoy. The agents do most of the typing, but I still decide what
gets built and what ships.

If that isn't for you, you're free not to use it. OpenTierBoy is open source under the AGPL-3.0 licence, and
[CONTRIBUTING.md](https://github.com/infinia-yzl/opentierboy/blob/main/CONTRIBUTING.md) explains how to help, with or
without AI.

## Try it

Open [OpenTierBoy](https://www.opentierboy.com), rank something, and tell me what you think on
[Discord](https://discord.gg/CEtDSHV38b). I may not always reply, but I read all messages!

Thank you and happy ranking!

---

Craft, rank and share with [OpenTierBoy](https://www.opentierboy.com/).
