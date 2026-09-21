/* ═══════════════════════════════════════════════════════════════════
   Motion TV — content catalog
   ───────────────────────────────────────────────────────────────────
   This is the ONLY file you need to edit to run Motion TV.

   • Add a video ........ add an entry to `items` (see "Adding videos").
   • Go live ............ fill in `live` (YouTube channel or HLS URL)
                          and add your weekly times to `live.schedule`.
   • Guided audio ....... write the script in an `audio` item, then run
                          `node tools/elevenlabs-voiceovers.mjs` to
                          produce the narrated MP3 with ElevenLabs.

   Anything without playable media stays hidden from visitors. Open
   motion-tv.html?preview=1 to see pending items while you work.
   ═══════════════════════════════════════════════════════════════════ */

window.MOTION_TV = {

  /* ── MEMBERS ─────────────────────────────────────────────────────
     Members sign in with the same account they use for online booking
     and the Cowboy Yoga app. Full studio classes are uploaded in the EHR
     (Yoga Studio → Move TV) and only play for members with an active
     paid plan — the database enforces that, not this page.

     The key below is Supabase's *publishable* key: it is meant to be in
     website code and can only do what the database's security rules
     allow. Never put a secret / service_role key here. */
  members: {
    supabaseUrl: 'https://tdctzlbiuuvubnscmqho.supabase.co',
    publishableKey: 'sb_publishable_AGegsoetVdHK7wzDks3g8A_TzUiMbMS',
    widgetToken: 'a965fe66-6990-43f4-a627-4668ad6c89a4',   // Cowboy Yoga booking widget
    joinUrl: 'https://ehr.cowboy-systems.com/?widget=a965fe66-6990-43f4-a627-4668ad6c89a4'
  },

  /* ── LIVE CHANNEL ────────────────────────────────────────────────
     Easiest setup: stream from the studio with YouTube Live and paste
     your channel ID (starts with "UC…", found in YouTube Studio →
     Settings → Channel → Advanced). The player automatically shows
     whatever the channel is streaming at that moment.
     Alternatively paste an HLS URL from Mux, Cloudflare Stream, etc. */
  live: {
    youtubeChannelId: '',   // e.g. 'UCxxxxxxxxxxxxxxxxxxxxxx'
    youtubeVideoId: '',     // optional: a specific scheduled stream instead of the channel
    hlsUrl: '',             // optional: 'https://stream.mux.com/<playback-id>.m3u8'
    forceLive: false,       // true = show the live player right now, regardless of schedule
    timeZone: 'America/New_York',
    preRollMinutes: 10,     // live player opens this many minutes before class
    /* Weekly live classes, in studio time. Example:
       { day: 'Tue', start: '18:00', minutes: 60, title: 'Sculpt Yoga', instructor: 'Morgan Gallagher' } */
    schedule: []
  },

  /* ── PROGRAMS (rows in the library) ──────────────────────────── */
  programs: [
    {
      id: 'breathwork',
      title: 'Breathwork',
      tagline: 'Guided breathing you can do anywhere: follow the light, match your breath.',
      palette: ['#7C8B6F', '#C09A72']
    },
    {
      id: 'guided',
      title: 'Guided Sessions',
      tagline: 'Narrated body scans, resets, and wind-downs for your day.',
      palette: ['#9E7A52', '#5E6B52']
    },
    {
      id: 'sculpt',
      title: 'Sculpt Yoga',
      tagline: 'Strength training meets yoga flow.',
      image: 'https://images.unsplash.com/photo-1599901860904-17e6ed7083a0?w=900&q=80',
      page: 'sculpt-yoga.html',
      palette: ['#C09A72', '#4A4239']
    },
    {
      id: 'buti',
      title: 'Buti Yoga',
      tagline: 'Yoga, tribal dance, and plyometrics — serious cardio.',
      image: 'https://images.unsplash.com/photo-1575052814086-f385e2e2ad1b?w=900&q=80',
      page: 'buti-yoga.html',
      palette: ['#B07A5A', '#4A4239']
    },
    {
      id: 'therapeutic',
      title: 'Therapeutic Yoga',
      tagline: 'Clinically informed movement for recovery and chronic pain.',
      image: 'https://images.unsplash.com/photo-1599447421416-3414500d18a5?w=900&q=80',
      page: 'therapeutic-yoga.html',
      palette: ['#7C8B6F', '#4A4239']
    },
    {
      id: 'deep',
      title: 'Deep Yoga',
      tagline: 'Long holds, deep stretching, breath-centered flow.',
      image: 'https://images.unsplash.com/photo-1593811167562-9cef47bfc4d7?w=900&q=80',
      page: 'deep-yoga.html',
      palette: ['#5E6B52', '#1C1917']
    }
  ],

  /* ── LIBRARY ─────────────────────────────────────────────────────
     Adding videos — pick the type that matches where the video lives:

       YouTube (public or unlisted):
         { id: 'sculpt-full-body-45', program: 'sculpt', type: 'youtube',
           videoId: 'dQw4w9WgXcQ', title: 'Full-Body Sculpt', minutes: 45,
           level: 'All levels', instructor: 'Morgan Gallagher',
           description: '…', thumbnail: 'optional-image-url.jpg' }

       Vimeo:     type: 'vimeo', videoId: '123456789'
       MP4 file:  type: 'mp4',   src: 'motion-tv/video/flow.mp4', poster: '…jpg'
       HLS/Mux:   type: 'hls',   src: 'https://stream.mux.com/<id>.m3u8'

     `id` must be unique; it becomes the shareable link
     (motion-tv.html#watch=<id>). */
  items: [

    /* Breathwork — interactive, runs entirely in the browser. */
    {
      id: 'box-breathing',
      program: 'breathwork',
      type: 'breath',
      title: 'Box Breathing',
      subtitle: 'Steady focus',
      level: 'All levels',
      description: 'Four equal sides: breathe in, hold, breathe out, hold. A simple, even rhythm used to settle the mind before a demanding moment.',
      pattern: [
        { phase: 'inhale', seconds: 4 },
        { phase: 'hold', seconds: 4 },
        { phase: 'exhale', seconds: 4 },
        { phase: 'hold', seconds: 4 }
      ],
      durations: [3, 5, 10],
      defaultDuration: 5
    },
    {
      id: 'downshift-breath',
      program: 'breathwork',
      type: 'breath',
      title: 'Downshift Breath',
      subtitle: 'Unwind after a long day',
      level: 'Beginner friendly',
      description: 'Breathe in for four, out for six. Letting the exhale run a little longer than the inhale is one of the gentlest ways to slow down.',
      pattern: [
        { phase: 'inhale', seconds: 4 },
        { phase: 'exhale', seconds: 6 }
      ],
      durations: [3, 5, 10],
      defaultDuration: 5
    },
    {
      id: 'evening-478',
      program: 'breathwork',
      type: 'breath',
      title: '4-7-8 Evening Breath',
      subtitle: 'Settle before sleep',
      level: 'All levels',
      description: 'In through the nose for four, hold for seven, a long slow exhale for eight. Start with a few rounds; if you feel lightheaded, return to normal breathing.',
      pattern: [
        { phase: 'inhale', seconds: 4 },
        { phase: 'hold', seconds: 7 },
        { phase: 'exhale', seconds: 8 }
      ],
      durations: [1.5, 3, 5],
      defaultDuration: 1.5
    },
    {
      id: 'coherent-breath',
      program: 'breathwork',
      type: 'breath',
      title: 'Coherent Breathing',
      subtitle: 'Find your rhythm',
      level: 'All levels',
      description: 'An even, unhurried rhythm of about five and a half breaths per minute. Smooth in, smooth out, no holds.',
      pattern: [
        { phase: 'inhale', seconds: 5.5 },
        { phase: 'exhale', seconds: 5.5 }
      ],
      durations: [5, 10, 15],
      defaultDuration: 10
    },

    /* Guided audio — narrated with ElevenLabs.
       Run `node tools/elevenlabs-voiceovers.mjs` to generate `src` from
       `script`. <break time="2s" /> inserts a pause (max 3s each). */
    {
      id: 'arrive-body-scan',
      program: 'guided',
      type: 'audio',
      title: 'Arrive: Body Scan',
      subtitle: 'A few quiet minutes to land',
      minutes: 5,
      level: 'All levels',
      description: 'A slow, head-to-toe check-in. Good before class, on a lunch break, or any time your day is moving faster than you are.',
      src: 'motion-tv/audio/arrive-body-scan.mp3',
      script: `Welcome to Motion TV, from Cowboy Yoga. <break time="1.5s" />
Find a position that feels supported. Seated, or lying down. <break time="1.5s" /> Let your hands rest wherever they land. <break time="2s" />
If it feels comfortable, close your eyes. Or soften your gaze toward the floor. <break time="2.5s" />
Take a slow breath in through your nose. <break time="2s" /> And let it go. <break time="3s" />
We'll move our attention slowly through the body. There's nothing to fix. Just notice. <break time="2.5s" />
Start at the top of your head. <break time="1.5s" /> Notice your forehead. Let it be smooth. <break time="2.5s" />
Your eyes, resting heavy. <break time="1.5s" /> Your jaw. Let your teeth part slightly, your tongue rest. <break time="3s" />
Bring your attention to your neck and shoulders. These carry a lot. <break time="1.5s" /> On your next exhale, let them drop, just a little. <break time="3s" />
Down through your arms, <break time="1s" /> your elbows, <break time="1s" /> your wrists, <break time="1s" /> all the way to your fingertips. <break time="3s" />
Notice your chest rising and falling on its own. <break time="3s" />
Your belly. Let it be soft. There's no need to hold it in here. <break time="3s" />
Your lower back. If there's tension, just breathe toward it. <break time="3s" />
Your hips, <break time="1s" /> your thighs, <break time="1s" /> your knees. <break time="2.5s" />
Your calves, your ankles, <break time="1s" /> and the soles of your feet. <break time="3s" />
Now feel the whole body at once. Breathing. Here. <break time="3s" />
Take one more full breath in. <break time="2s" /> And a long breath out. <break time="3s" />
When you're ready, let a little movement return to your fingers and toes. <break time="2s" />
Thank you for taking this time for yourself. We'll see you on the mat.`
    },
    {
      id: 'desk-reset',
      program: 'guided',
      type: 'audio',
      title: 'Three-Minute Desk Reset',
      subtitle: 'Seated, no mat needed',
      minutes: 3,
      level: 'All levels',
      description: 'Gentle seated movement for your neck, shoulders, and spine. Move slowly and stay in a pain-free range.',
      src: 'motion-tv/audio/desk-reset.mp3',
      script: `This is your three-minute desk reset, from Cowboy Yoga. <break time="1.5s" />
Scoot toward the front of your chair and plant both feet flat on the floor. <break time="2s" />
Sit tall, as if a string is lifting the crown of your head. <break time="2s" />
Everything we do today should feel easy. If anything pinches or hurts, make the movement smaller, or skip it. <break time="2s" />
Breathe in, and lift your shoulders up toward your ears. <break time="2s" /> Breathe out, and let them drop. <break time="2s" />
Again. Lift. <break time="2s" /> And release. <break time="2s" />
One more time. <break time="2s" /> And let it all go. <break time="2.5s" />
Now slowly tip your right ear toward your right shoulder. <break time="1.5s" /> Just to where you feel a gentle stretch. <break time="3s" /> Breathe here. <break time="3s" />
Bring your head back to center. <break time="1.5s" /> And tip your left ear toward your left shoulder. <break time="3s" /> Breathe. <break time="3s" />
Back to center. <break time="2s" />
Place your hands on your knees. <break time="1s" /> As you breathe in, gently lift your chest and look slightly up. <break time="2s" /> As you breathe out, round your back and let your chin fall. <break time="2s" />
In, lifting. <break time="2s" /> Out, rounding. <break time="2s" />
Once more. In. <break time="2s" /> And out. <break time="2.5s" />
Come back to a tall, neutral spine. <break time="1.5s" />
Place your right hand on your left knee, and gently turn to the left. <break time="1.5s" /> Keep the movement easy. <break time="3s" /> Breathe. <break time="2s" />
Back to center. <break time="1s" /> Left hand to the right knee, and turn to the right. <break time="3s" /> Breathe. <break time="2s" />
And back to center. <break time="1.5s" />
Take one full breath in. <break time="2s" /> And out. <break time="2s" />
That's your reset. Enjoy the rest of your day.`
    },
    {
      id: 'evening-wind-down',
      program: 'guided',
      type: 'audio',
      title: 'Evening Wind-Down',
      subtitle: 'Let the day go',
      minutes: 6,
      level: 'All levels',
      description: 'A slow, spoken wind-down to help you close out the day. Best lying down with the lights low.',
      src: 'motion-tv/audio/evening-wind-down.mp3',
      script: `Good evening. This is Motion TV, from Cowboy Yoga. <break time="1.5s" />
Let's close out the day together. <break time="2s" />
Lie down if you can, somewhere comfortable. Let your arms rest by your sides, palms facing up. <break time="3s" />
Let your eyes close. <break time="2s" />
Breathe in slowly through your nose. <break time="2.5s" /> And sigh it out through your mouth. <break time="3s" />
Once more. In. <break time="2.5s" /> And let it go. <break time="3s" />
Now let your breath find its own pace. You don't need to control it. <break time="3s" />
Think back over your day, not to judge it, just to notice. <break time="2s" /> Whatever happened today has already happened. <break time="3s" />
Anything left unfinished can wait until tomorrow. <break time="3s" />
Feel the weight of your body sinking into the surface beneath you. <break time="2s" /> Your heels. <break time="1.5s" /> Your hips. <break time="1.5s" /> Your shoulder blades. <break time="1.5s" /> The back of your head. <break time="3s" />
With each exhale, let yourself get a little heavier. <break time="3s" />
Breathe in, counting slowly to four. <break time="3s" /> And out, counting slowly to six. <break time="3s" />
In, for four. <break time="3s" /> Out, for six. <break time="3s" />
Keep that rhythm on your own. <break time="3s" /> <break time="3s" />
Let your jaw soften. <break time="1.5s" /> Your hands. <break time="1.5s" /> Your belly. <break time="3s" />
You've done enough for today. <break time="3s" />
Stay here as long as you like. And when you're ready, let yourself drift toward sleep. <break time="2s" />
Goodnight.`
    }

    /* Studio class videos go here as they're filmed — see "Adding videos" above. */
  ],

  /* ── VOICE CUES for breathwork (optional) ─────────────────────────
     Short spoken cues that play at each phase change. Generated by the
     ElevenLabs script alongside the guided audio. Without these files,
     breathwork uses soft chimes instead. */
  voiceCues: {
    inhale: { text: 'Breathe in.', src: 'motion-tv/audio/cues/inhale.mp3' },
    hold: { text: 'Hold.', src: 'motion-tv/audio/cues/hold.mp3' },
    exhale: { text: 'Breathe out.', src: 'motion-tv/audio/cues/exhale.mp3' }
  }
};
