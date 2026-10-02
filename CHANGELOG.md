# Changelog

## 1.2.0

- The unread count is now a badge on the Puppets tab instead of "Puppets (N)" in the title.
- The panel adds itself (without taking focus) the first time the game sends puppets. *Show panel* (Auto / On / Off) stays where it was in Puppets' settings.
- The list and the viewpoint head show each puppet's `#id`. Counts above 99 show as `99+`.
- Opening a puppet puts the cursor in its command line, which now reads "Act as <name>".
- Clear asks before it empties a puppet's buffer.
- Save downloads the buffer as plain text, named `puppet-<id>-<date-time>.txt`.
- Lines keep their colours: ANSI colours and the game's HTML markup are shown instead of raw codes.
- Other extensions can ask the game to add a puppet (an activity feed's "Add puppet"), sent as `Client.Puppets.Add`. Its route can be changed under *Actions* like the command line's.
- Messages from the game that don't match the documented shapes are rejected with an error in the session instead of being half-read.
- Needs μClient 1.12 or later.

## 1.1.1

- Its own repository, [runmu-sh/ext-puppets](https://github.com/runmu-sh/ext-puppets), made with `npm create @runmu.sh/extension` and published to the marketplace from its version tags. The package is `@runmu.sh/ext-puppets`, built against `@runmu.sh/sdk` from npm. Nothing changes in the extension itself.

## 1.1.0

- Published to the marketplace as `puppets`; no longer bundled with μClient.

## 1.0.0

- Remote puppet viewpoints as a first-party extension (06-world-modules §5), with the exported `PuppetsApi`.
