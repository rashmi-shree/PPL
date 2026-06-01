export const metadata = {
  title: "Privacy Policy - PPL Workout Tracker",
  description: "How the PPL Workout Tracker app collects, uses, and protects your data.",
};

const UPDATED = "June 1, 2026";
const CONTACT = "rashmidivya.shree6@gmail.com";

export default function PrivacyPage() {
  return (
    <main className="page">
      <article className="legal">
        <h1>Privacy Policy</h1>
        <p className="muted">Last updated: {UPDATED}</p>

        <p>
          PPL Workout Tracker (&quot;the app&quot;, &quot;we&quot;, &quot;us&quot;) helps you
          follow a Push / Pull / Legs training program and track your workouts. This
          policy explains what data we collect and how we use it.
        </p>

        <h2>Information we collect</h2>
        <ul>
          <li>
            <strong>Account information:</strong> your email address (and, if you use
            Google sign-in, the basic profile Google shares to authenticate you).
          </li>
          <li>
            <strong>Workout data you enter:</strong> exercises, weights, reps, sets,
            session notes/RPE, body weight entries, and the dates you train.
          </li>
          <li>
            <strong>App preferences:</strong> theme and notification settings stored on
            your device.
          </li>
        </ul>

        <h2>How we use your information</h2>
        <ul>
          <li>To create and secure your account.</li>
          <li>To save your workout history and show your progress over time.</li>
          <li>To send the in-app and (if you opt in) device reminders you enable.</li>
        </ul>
        <p>
          We do <strong>not</strong> sell your personal data, and we do not use it for
          advertising.
        </p>

        <h2>Where your data is stored</h2>
        <p>
          Account and workout data are stored using Supabase, our cloud database and
          authentication provider, protected by row-level security so each user can only
          access their own data. Some preferences are also cached locally on your device
          so the app works offline.
        </p>

        <h2>Third-party services</h2>
        <ul>
          <li>
            <strong>Supabase</strong> - database, authentication, and storage.
          </li>
          <li>
            <strong>Google Sign-In</strong> - optional login method.
          </li>
        </ul>

        <h2>Data retention and deletion</h2>
        <p>
          We keep your data for as long as your account exists. You can request deletion
          of your account and all associated workout data at any time by emailing us at{" "}
          <a href={`mailto:${CONTACT}`}>{CONTACT}</a>. We will delete it within 30 days.
        </p>

        <h2>Children</h2>
        <p>
          The app is not directed at children under 13, and we do not knowingly collect
          data from them.
        </p>

        <h2>Changes to this policy</h2>
        <p>
          We may update this policy from time to time. Material changes will be reflected
          by the &quot;Last updated&quot; date above.
        </p>

        <h2>Contact</h2>
        <p>
          Questions about this policy? Email{" "}
          <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.
        </p>
      </article>
    </main>
  );
}
