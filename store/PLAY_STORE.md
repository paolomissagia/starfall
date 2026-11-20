# Google Play release kit

Everything Play Console asks for, ready to paste or upload.

## Store listing

**App name** (30 max)
> Starfall: Flashcard Typing

**Short description** (80 max)
> Type the answer before the word lands. A typing game for your Anki decks.

**Full description** (4000 max)
> Words are falling from the sky. Type the answer before they reach the ground.
>
> Starfall turns your flashcards into a fast, focused typing game. Import a deck, choose which side falls, and stop each rock by typing its answer. Miss one and you'll retype it straight away, and it comes back again soon, while it's still fresh.
>
> BRING YOUR OWN DECKS
> • Import Anki "Notes in Plain Text" exports (.txt), CSV or TSV files from your phone or cloud storage
> • Or paste cards straight in, one per line
> • Swap front and back with one tap
>
> LEARN WHILE YOU PLAY
> • Missed cards come back sooner and more often
> • Stuck? Tap a falling rock to peek at its answer (half points)
> • Forgiving answers: ignores capitals, accents and punctuation, and allows one typo
> • End-of-run review lists every word you missed, with a "practice missed" round
>
> A REAL GAME
> • Levels speed up and add more rocks at once
> • Streak bonuses, three shields and a best score for every deck
> • Gentle, Brisk or Frantic starting speed
>
> PRIVATE BY DESIGN
> No account, no ads, no tracking. Your decks stay on your device.

**Category:** Education (Game › Word also fits)
**Tags:** Flashcards, Language learning, Vocabulary, Typing
**Contact email:** your developer email (Play requires one; it is shown publicly)
**Privacy policy URL:** `https://starfall-indol.vercel.app/privacy` (or your custom domain)

## Graphics (in this folder)

| Asset | File | Spec |
| --- | --- | --- |
| App icon | `icon-512.png` | 512×512 PNG |
| Feature graphic | `feature-graphic.png` | 1024×500 PNG |
| Phone screenshots | `screenshots/1-play.png` … `5-impact.png` | 1080×1920 (9:16), 2–8 required |

## App content forms

**Privacy policy:** the URL above.

**Ads:** No, the app does not contain ads.

**App access:** All functionality is available without special access (no login).

**Target audience and content:** choose **13 and over**. If you include under-13s, Google's Families policy adds extra requirements. Not designed for children.

**Content rating questionnaire (IARC):** category *Reference, News, or Educational* (or *Game* › *Puzzle/Word*). Answer **No** to violence, sexuality, language, controlled substances, gambling, user interaction/communication, sharing location and digital purchases. The expected rating is Everyone / PEGI 3.

**Data safety:**
- Does your app collect or share any of the required user data types? **No**
- Is all user data encrypted in transit? Not applicable (no data is transmitted)
- Do you provide a way for users to request that their data is deleted? Not applicable. Everything is stored on the device, and uninstalling deletes it.

**Government apps / financial features / health:** No.

**News app:** No.

## Release steps

1. **Developer account.** Sign up at play.google.com/console ($25 one-time) and complete identity verification.
2. **Create the app.** Name Starfall, default language English, App (or Game), Free.
3. **Build the bundle.** `npx eas-cli@latest build -p android --profile production` creates a signed `.aab`. EAS generates and keeps the upload key.
4. **First upload is manual.** Google requires the first bundle of a new app to be uploaded in Play Console. Go to *Testing › Internal testing › Create release* and upload the `.aab` from the EAS build page.
5. **Fill the forms above** under *Policy › App content* and *Grow › Store presence › Main store listing*.
6. **Closed testing (new personal accounts).** Run a closed test with at least 12 testers who stay opted in for 14 days. Then apply for production access in the dashboard.
7. **Production.** Promote the tested release.

### Later releases: automated submit

1. In Google Cloud, create a service account, then invite it in Play Console *Users and permissions* with release permissions.
2. Download its JSON key to `google-play-service-account.json` in the project root. The file is git-ignored.
3. `npx eas-cli@latest build -p android --profile production --auto-submit`

Submissions go to the **internal** track as **drafts** (see `eas.json`). Promote them in Play Console.
