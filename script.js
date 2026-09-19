/**
 * Main Application Script
 * Manages the access-code gate, first-time setup form, screen
 * transitions, video timing, and dynamic personalization.
 */

class WeddingGiftExperience {
    constructor(data) {
        this.config = {
            groomName: data.groomName,
            brideName: data.brideName,
            weddingDate: DateUtils.parseDateOnly(data.weddingDate),
        };
        this.video = document.getElementById('welcome-video');
        this.screen1 = document.getElementById('screen-1');
        this.screen2 = document.getElementById('screen-2');
        this.currentScreen = 1;

        this.init();
    }

    init() {
        // Personalize Screen 1
        this.personalizeWelcome();

        // Set up video event listeners
        this.setupVideoListeners();

        // Personalize Screen 2
        this.personalizeJourney();

        // Start the live anniversary countdown (updates every second)
        this.startAnniversaryCountdown();

        // Ensure video starts playing (handle autoplay restrictions)
        this.ensureVideoPlayback();
    }

    /**
     * Personalize Screen 1 with couple names and wedding date
     */
    personalizeWelcome() {
        document.getElementById('groom-name').textContent = this.config.groomName.toUpperCase();
        document.getElementById('bride-name').textContent = this.config.brideName.toUpperCase();
        document.getElementById('wedding-date').textContent =
            DateUtils.formatDate(this.config.weddingDate).toUpperCase();
    }

    /**
     * Set up video event listeners
     */
    setupVideoListeners() {
        // When video ends or reaches the natural end point, transition to Screen 2
        this.video.addEventListener('ended', () => {
            this.scheduleTransitionToScreen2();
        });

        // Handle autoplay failures gracefully
        this.video.addEventListener('error', () => {
            console.warn('Video failed to load. Proceeding to next screen.');
            this.scheduleTransitionToScreen2(3000);
        });
    }

    /**
     * Ensure the video plays (handle browser autoplay restrictions)
     */
    ensureVideoPlayback() {
        const playPromise = this.video.play();

        if (playPromise !== undefined) {
            playPromise
                .catch(error => {
                    // Autoplay was prevented
                    console.log('Autoplay prevented by browser. User may need to interact.');
                })
                .then(() => {
                    // Video is playing
                });
        }
    }

    /**
     * Schedule transition from Screen 1 to Screen 2
     */
    scheduleTransitionToScreen2(delayMs = 500) {
        setTimeout(() => {
            this.transitionToScreen2();
        }, delayMs);
    }

    /**
     * Perform the transition from Screen 1 to Screen 2
     */
    transitionToScreen2() {
        this.screen1.classList.add('fade-out');
        this.screen2.classList.add('fade-in');
        this.currentScreen = 2;
        document.body.classList.remove('screen-1-active');
        document.body.classList.add('screen-2-active');
    }

    /**
     * Personalize Screen 2 (Our Journey So Far) with dynamic data.
     * screen2.png already contains every label/phrase/heading, so this
     * only ever needs to fill in couple-specific numbers — the same
     * template works for any couple since the data comes from the DB.
     */
    personalizeJourney() {
        const today = new Date();
        const weddingDate = this.config.weddingDate;

        document.getElementById('journey-groom-name').textContent = this.config.groomName;
        document.getElementById('journey-bride-name').textContent = this.config.brideName;
        document.getElementById('journey-date-month').textContent =
            weddingDate.toLocaleDateString('en-US', { month: 'long' });
        document.getElementById('journey-date-day-year').textContent =
            `${weddingDate.getDate()}, ${weddingDate.getFullYear()}`;

        const daysTogether = DateUtils.daysBetween(weddingDate, today);
        const fullMoons = DateUtils.calculateFullMoons(weddingDate, today);
        const seasons = DateUtils.calculateSeasons(weddingDate, today);

        document.getElementById('stat-days').textContent =
            DateUtils.formatNumber(daysTogether);
        document.getElementById('stat-sunrises').textContent =
            DateUtils.formatNumber(daysTogether);
        document.getElementById('stat-nights').textContent =
            DateUtils.formatNumber(daysTogether);
        document.getElementById('stat-full-moons').textContent =
            DateUtils.formatNumber(fullMoons);
        document.getElementById('stat-seasons').textContent = seasons;
    }

    /**
     * Live "next anniversary" countdown — updates every second and
     * automatically rolls over to the following year once it arrives.
     */
    startAnniversaryCountdown() {
        const daysEl = document.getElementById('anniversary-days');
        const hoursEl = document.getElementById('anniversary-hours');
        const minutesEl = document.getElementById('anniversary-minutes');
        const secondsEl = document.getElementById('anniversary-seconds');
        const heartbeatsEl = document.getElementById('stat-heartbeats');

        const tick = () => {
            const parts = DateUtils.calculateAnniversaryCountdown(this.config.weddingDate);
            daysEl.textContent = DateUtils.formatNumber(parts.days);
            hoursEl.textContent = DateUtils.padTwoDigits(parts.hours);
            minutesEl.textContent = DateUtils.padTwoDigits(parts.minutes);
            secondsEl.textContent = DateUtils.padTwoDigits(parts.seconds);

            const heartbeats = DateUtils.calculateLiveHeartbeats(this.config.weddingDate, new Date());
            heartbeatsEl.textContent = DateUtils.formatNumber(heartbeats);
        };

        tick();
        setInterval(tick, 1000);
    }
}

/**
 * Access gate: resolves an access code to either "go straight to the
 * gift" (already personalized) or "show the first-time setup form"
 * (empty row), then hands off to WeddingGiftExperience once data is
 * ready. Nothing below this point ever touches a hardcoded config.
 */
class AccessGate {
    constructor() {
        this.screenAccess = document.getElementById('screen-access');
        this.screenFill = document.getElementById('screen-fill');
        this.accessForm = document.getElementById('access-form');
        this.accessInput = document.getElementById('access-code-input');
        this.accessError = document.getElementById('access-error');
        this.fillForm = document.getElementById('fill-form');
        this.fillError = document.getElementById('fill-error');
        this.pendingCode = null;

        this.accessForm.addEventListener('submit', (e) => this.handleAccessSubmit(e));
        this.fillForm.addEventListener('submit', (e) => this.handleFillSubmit(e));
    }

    setBusy(form, busy) {
        form.querySelector('button[type="submit"]').disabled = busy;
    }

    async handleAccessSubmit(e) {
        e.preventDefault();
        this.accessError.textContent = '';
        const code = this.accessInput.value.trim().toUpperCase();
        if (!code) return;

        this.setBusy(this.accessForm, true);
        try {
            const res = await fetch(`/api/gift?code=${encodeURIComponent(code)}`);
            const data = await res.json();

            if (!res.ok || !data.found) {
                this.accessError.textContent = 'That access code was not found. Please check and try again.';
                return;
            }

            this.pendingCode = code;

            if (data.filled) {
                this.screenAccess.classList.add('fade-out');
                new WeddingGiftExperience(data);
            } else {
                this.screenAccess.classList.add('fade-out');
                this.screenFill.classList.add('fade-in');
            }
        } catch (err) {
            console.error(err);
            this.accessError.textContent = 'Something went wrong. Please try again.';
        } finally {
            this.setBusy(this.accessForm, false);
        }
    }

    async handleFillSubmit(e) {
        e.preventDefault();
        this.fillError.textContent = '';

        const payload = {
            code: this.pendingCode,
            groomName: document.getElementById('fill-groom-name').value.trim(),
            brideName: document.getElementById('fill-bride-name').value.trim(),
            weddingDate: document.getElementById('fill-wedding-date').value,
            creationCode: document.getElementById('fill-creation-code').value.trim(),
        };

        if (!payload.groomName || !payload.brideName || !payload.weddingDate || !payload.creationCode) {
            this.fillError.textContent = 'Please fill in every field.';
            return;
        }

        this.setBusy(this.fillForm, true);
        try {
            const res = await fetch('/api/gift-fill', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            const data = await res.json();

            if (!res.ok || !data.success) {
                this.fillError.textContent = data.error || 'Something went wrong. Please try again.';
                return;
            }

            this.screenFill.classList.add('fade-out');
            new WeddingGiftExperience(data);
        } catch (err) {
            console.error(err);
            this.fillError.textContent = 'Something went wrong. Please try again.';
        } finally {
            this.setBusy(this.fillForm, false);
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new AccessGate();
});
