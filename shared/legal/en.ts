import type { LegalTexts } from './types'

/*
 * FOR NINA TO REVIEW: these texts describe what the application actually does (checked against the code, see DEVELOPER.md § 20.13),
 * but they are NOT legal advice. Have them reviewed (CNIL templates, service-public.fr) before going live. The French version
 * (fr.ts) is the reference; keep both in step (test/unit/legal.test.ts checks the structure).
 */
export const legalEn: LegalTexts = {
  contactLabel: 'Contact: ',
  contactFallback: 'A dedicated contact address will be published here soon. In the meantime you can exercise most of your rights yourself from the Settings page (export and deletion of your data).',
  updatedLabel: 'Last updated: ',
  pages: {
    mentions: {
      title: 'Legal notice',
      intro: 'Legal information about the site and its hosting.',
      sections: [
        {
          id: 'editeur',
          title: 'Site publisher',
          blocks: [
            { type: 'p', text: 'This site is published on a non-professional basis by an individual, with no commercial purpose: it is free and contains no advertising.' },
            { type: 'p', text: 'Under article 6, III, 2 of French law no. 2004-575 of 21 June 2004 (LCEN), the publisher has chosen not to make her name and address public. She has given her identity to her hosting providers, from whom a judicial authority may request it.' },
            { type: 'contact' }
          ]
        },
        {
          id: 'hebergement',
          title: 'Hosting',
          blocks: [
            { type: 'p', text: 'The site (pages and server functions) is hosted by:' },
            { type: 'ul', items: ['Vercel Inc., 440 N Barranca Avenue #4133, Covina, CA 91723, United States — vercel.com.'] },
            { type: 'p', text: 'The database, account sign-in and file storage are provided by:' },
            { type: 'ul', items: ['Supabase, Inc., 3500 S. DuPont Highway, Dover, DE 19901, United States — supabase.com. The site\'s data is hosted in the European Union (Paris region).'] }
          ]
        },
        {
          id: 'contenus',
          title: 'Content published by users',
          blocks: [
            { type: 'p', text: 'Recipes, photos and texts are published by people who have an account, who are responsible for them (see the terms of use). To report content, use the "Report" link shown on every recipe that is not yours and on public pages.' }
          ]
        },
        {
          id: 'donnees',
          title: 'Personal data',
          blocks: [
            { type: 'p', text: 'How your data is processed is described in the privacy policy.' }
          ]
        }
      ]
    },

    privacy: {
      title: 'Privacy policy',
      intro: 'What data the site uses, why, who it is shared with, how long it is kept, and how to exercise your rights.',
      sections: [
        {
          id: 'responsable',
          title: 'Who is responsible?',
          blocks: [
            { type: 'p', text: 'The data controller is the publisher of the site (an individual, see the legal notice).' },
            { type: 'contact' }
          ]
        },
        {
          id: 'donnees',
          title: 'The data we process',
          blocks: [
            { type: 'ul', items: [
              'Account: e-mail address, name entered at sign-up and password (stored only in encrypted form by the authentication service, never readable); with Google sign-in, the name and e-mail address Google provides.',
              'Profile: nickname (visible to other people), your cookbook title, theme, preferred language, notification setting, whether you appear in search.',
              'Content: your recipes (title, ingredients, steps, notes, tags, category, automatic translation), your categories, your photos if you add any, your favorites, your meal planner and your shopping lists.',
              'Sharing: your friends and friend requests, your groups, invitations and sharing permissions, your public links, your in-app notifications, the banners you have dismissed.',
              'Reports: those you send (reason, details, recipe concerned).',
              'Artificial intelligence: a usage log (date, feature, model used, number of tokens, estimated cost, success or failure) to apply the daily limit and follow costs. The content sent is not kept in this log.',
              'Technical data: the hosting provider keeps operating logs (IP address, date, requested page) for security and proper operation of the service; the application adds nothing to them.'
            ] },
            { type: 'p', text: 'We do not sell any data, we show no advertising and we use no audience measurement tool or profiling.' }
          ]
        },
        {
          id: 'finalites',
          title: 'Why, and on what legal basis',
          blocks: [
            { type: 'ul', items: [
              'Providing the service (creating an account, keeping and displaying your recipes, sharing them, planner, shopping lists): performance of the service you request by creating an account.',
              'Importing and translating recipes with AI, at your request: performance of the service.',
              'Security, abuse prevention and moderation (usage limits, reports, handling of unlawful content): the publisher\'s legitimate interest and the duty to act on manifestly unlawful content.',
              'Detecting and fixing technical errors: legitimate interest.',
              'Account confirmation and password reset e-mails: necessary for the service. The "e-mail notifications" setting is saved, but no such e-mail is sent for the moment; if that changes, it will be based on this setting (your consent) and this page will be updated.'
            ] }
          ]
        },
        {
          id: 'destinataires',
          title: 'Who the data is shared with',
          blocks: [
            { type: 'p', text: 'Other users only see your nickname and what you choose to share (never your e-mail address). Technical providers (processors):' },
            { type: 'ul', items: [
              'Supabase (database, accounts, photo storage): hosted in the European Union (Paris).',
              'Vercel (hosting of the site and server functions): a US company.',
              'OpenAI (artificial intelligence): a US company. Sent for extraction or translation: the text you paste or dictate (dictation is sent as an audio recording to be transcribed), the photos and PDFs you drop, and the text of a recipe when it is translated into the other language. Neither your e-mail address nor your identifier is attached. According to the terms OpenAI publishes for its API, this data is not used to train its models and may be kept for up to 30 days to detect abuse.',
              'Sentry (error tracking): data hosted in the European Union. The application sends Sentry no cookies, no request headers, no request content, no identity or e-mail address; only the technical error message, the page concerned (without parameters) and browser information. The project is set not to store IP addresses.',
              'Google: only if you choose Google sign-in (Google receives your sign-in) or the import from Google Drive (loaded only when you click the button; the application can only read the files you choose, directly from your browser).'
            ] },
            { type: 'p', text: 'Several of these providers are located or operate outside the European Union (United States). Transfers rely on the safeguards provided by the GDPR, in particular the European Commission\'s standard contractual clauses or the EU–US data protection framework, depending on the provider.' }
          ]
        },
        {
          id: 'photos',
          title: 'Recipe photos',
          blocks: [
            { type: 'p', text: 'Photos are stored at Supabase. Today, a photo can be reached by anyone who knows its exact address (a long address that cannot be guessed and is never published in a list), even if the recipe itself is private. A planned change will make photos private: they will only be visible to people allowed to see the recipe. This page will then be updated.' }
          ]
        },
        {
          id: 'durees',
          title: 'How long',
          blocks: [
            { type: 'ul', items: [
              'Your data is kept as long as your account exists. When you delete your account, your profile, recipes, photos, favorites, planner, shopping lists, relationships, notifications and AI usage log are deleted.',
              'Copies another person made of one of your recipes belong to them and stay in their cookbook. Recipes others had added "as is" disappear from their cookbook (they are notified).',
              'Reports you sent are kept, detached from your account, to follow up moderation. No automatic purge period is scheduled at this time.',
              'The hosting provider\'s technical backups may keep some data for a while after a deletion, before being renewed.'
            ] }
          ]
        },
        {
          id: 'droits',
          title: 'Your rights',
          blocks: [
            { type: 'p', text: 'You have the right to access, rectify, erase, port, restrict and object. Most can be exercised directly in the application, on the Settings page:' },
            { type: 'ul', items: [
              'Access and portability: "Download my data" provides a readable JSON file (profile, recipes, sharing permissions, cookbook, categories, groups, friends, favorites, planner, shopping lists, notifications, reports, AI usage log). Other people only appear by nickname. Photos are not included. Limit: 3 exports per day.',
              'Rectification: you edit your nickname, your cookbook title, your preferences and your recipes.',
              'Erasure: "Delete my account" deletes your account and your data (see "How long").',
              'Objection, restriction, or any other request: through the contact given above.'
            ] },
            { type: 'contact' },
            { type: 'p', text: 'If you believe your rights are not being respected, you can complain to the CNIL (the French data protection authority):' },
            { type: 'link', label: 'cnil.fr/en/complaints', href: 'https://www.cnil.fr/en/complaints' }
          ]
        },
        {
          id: 'mineurs',
          title: 'Minors',
          blocks: [
            { type: 'p', text: 'The service is for people aged 15 and over. Below that age, a parent\'s consent is required.' }
          ]
        },
        {
          id: 'modifications',
          title: 'Changes',
          blocks: [
            { type: 'p', text: 'This page is updated when the way the site works changes; the date of the last update is shown at the top of the page.' }
          ]
        }
      ]
    },

    terms: {
      title: 'Terms of use',
      intro: 'The simple rules of this free shared-cookbook service.',
      sections: [
        {
          id: 'service',
          title: 'The service',
          blocks: [
            { type: 'p', text: 'The site lets you keep your recipes, share them with friends and groups, plan your meals and make shopping lists. It is free, offered with no guarantee of availability, and may change or stop. AI features are limited by a daily quota.' },
            { type: 'p', text: 'To create an account you must be 15 or older (or have a parent\'s consent) and provide a valid e-mail address, or use Google sign-in. You are responsible for keeping your password confidential.' }
          ]
        },
        {
          id: 'contenu',
          title: 'Your recipes and what you publish',
          blocks: [
            { type: 'p', text: 'You remain the owner of your recipes. By sharing them, you allow the people you choose to view them and, depending on the permission you give, to copy or edit them. You are responsible for what you publish.' },
            { type: 'ul', items: [
              'Only publish content you have the right to use. Copying word for word a protected recipe from a book or blog and making it available to others may infringe its author\'s rights.',
              'Prohibited: unlawful, hateful or violent content, content that violates privacy, spam, advertising and impersonation.'
            ] }
          ]
        },
        {
          id: 'partage',
          title: 'Sharing and public link',
          blocks: [
            { type: 'p', text: 'A recipe can be private, visible to your groups, shared with specific people, or reachable through a public link. Anyone who has a public link can read the recipe without an account and pass the link on: only create a link for what you accept to make available this way. You can revoke the link at any time; a copy someone has already made stays theirs. Public pages are not indexed by search engines.' },
            { type: 'p', text: 'Deleting a recipe removes it from the cookbook of people who had added it as is, but not from the copies they made.' }
          ]
        },
        {
          id: 'signalement',
          title: 'Reporting and moderation',
          blocks: [
            { type: 'p', text: 'Any signed-in person can report a recipe (unlawful content, copyright infringement, spam, other) with the "Report" link. Reports are limited to 10 per day per person to prevent abuse. The publisher reviews reports, may delete content that is manifestly unlawful or contrary to these terms, and may suspend or delete an account in case of abuse.' }
          ]
        },
        {
          id: 'responsabilite',
          title: 'Liability',
          blocks: [
            { type: 'p', text: 'Recipes are their authors\' own: the publisher guarantees neither their accuracy nor their safety (allergies, cooking, storage). Translations and extractions made by AI may contain errors: check them before cooking. The service is provided "as is". Keep a copy of what matters to you: you can download your data at any time.' }
          ]
        },
        {
          id: 'fin',
          title: 'Ending your account',
          blocks: [
            { type: 'p', text: 'You can delete your account at any time from Settings. The details are in the privacy policy.' },
            { type: 'contact' }
          ]
        }
      ]
    },

    cookies: {
      title: 'Cookies and tracking',
      intro: 'What the site stores in your browser, and why there is no consent banner.',
      sections: [
        {
          id: 'resume',
          title: 'In short',
          blocks: [
            { type: 'p', text: 'The site only uses cookies and storage that are strictly necessary for it to work or that hold preferences you choose yourself. There are no visitor statistics, no advertising, no social network trackers and no third-party tracking tool. This storage does not require consent (it is exempt under cookie regulations, which do not subject it to your agreement): that is why the site shows no cookie banner.' }
          ]
        },
        {
          id: 'liste',
          title: 'What is stored',
          blocks: [
            { type: 'ul', items: [
              'Session cookie "sb-…-auth-token" (Supabase): keeps you signed in. It only exists if you sign in, and is removed when you sign out.',
              'Cookie "i18n_redirected": remembers the interface language (French or English).',
              'Browser local storage "nuxt-color-mode": remembers light, dark or automatic mode.',
              'Local storage "shopping:prefs": remembers how you display your shopping lists.',
              'Local storage "offline:shopping:v1": a copy of your shopping lists so you can read them without a connection; erased when you sign out.',
              'Session storage "auth:redirect": remembers the page to return to after a Google sign-in; erased right afterwards.',
              'Service worker and caches of the installable app (PWA): remember visited pages, images, icons and fonts to speed up the site and make it readable offline; cached pages are cleared when you sign out. Requests to the database and to server functions are never cached.'
            ] }
          ]
        },
        {
          id: 'tiers',
          title: 'Third-party services',
          blocks: [
            { type: 'ul', items: [
              'Sentry receives technical errors, with no cookies and no identity (see the privacy policy).',
              'Google is only contacted if you choose Google sign-in, or if you click the import from Google Drive.',
              'The site\'s fonts are served by the site itself.'
            ] },
            { type: 'p', text: 'If an audience measurement tool or another tracker were ever added, this page would be updated and your agreement would be requested before any non-essential storage.' }
          ]
        },
        {
          id: 'effacer',
          title: 'Clearing them',
          blocks: [
            { type: 'p', text: 'You can clear these items at any time in your browser settings. This signs you out and resets your display preferences.' }
          ]
        }
      ]
    }
  }
}
