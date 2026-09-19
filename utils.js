/**
 * Utility functions for date calculations
 */

const DateUtils = {
    /**
     * Parses a plain "YYYY-MM-DD" string as a LOCAL calendar date (midnight
     * in the viewer's own timezone), avoiding the classic off-by-one bug
     * where `new Date("YYYY-MM-DD")` parses as UTC midnight and then local
     * getters (getDate/getMonth/getFullYear) read back the wrong day for
     * any timezone behind UTC.
     */
    parseDateOnly(dateString) {
        const [year, month, day] = dateString.split('-').map(Number);
        return new Date(year, month - 1, day);
    },

    /**
     * Calculate the number of days between two dates
     */
    daysBetween(startDate, endDate) {
        const millisecondsPerDay = 24 * 60 * 60 * 1000;
        const timeDiff = endDate.getTime() - startDate.getTime();
        return Math.floor(timeDiff / millisecondsPerDay);
    },

    /**
     * Calculate approximate heartbeats
     * Using 72 beats per minute as average
     */
    calculateHeartbeats(startDate, endDate) {
        const days = this.daysBetween(startDate, endDate);
        const beatsPerMinute = 72;
        const minutesPerDay = 24 * 60;
        return Math.floor(days * minutesPerDay * beatsPerMinute);
    },

    /**
     * Approximate heartbeats accumulated since a given start moment,
     * with millisecond precision so it can tick up live in real time.
     */
    calculateLiveHeartbeats(startDate, currentDate) {
        const beatsPerMinute = 72;
        const msElapsed = currentDate.getTime() - startDate.getTime();
        const minutesElapsed = msElapsed / 60000;
        return Math.floor(minutesElapsed * beatsPerMinute);
    },

    /**
     * Calculate number of full moon cycles (approximately 29.5 days per cycle)
     */
    calculateFullMoons(startDate, endDate) {
        const days = this.daysBetween(startDate, endDate);
        const daysPerMoonCycle = 29.53; // synodic month
        return Math.floor(days / daysPerMoonCycle);
    },

    /**
     * Calculate number of seasons passed
     * 365.25 days per year / 4 seasons = ~91.3 days per season
     */
    calculateSeasons(startDate, endDate) {
        const days = this.daysBetween(startDate, endDate);
        const daysPerSeason = 365.25 / 4;
        return Math.floor(days / daysPerSeason);
    },

    /**
     * Calculate days until next anniversary
     */
    calculateDaysUntilNextAnniversary(weddingDate, currentDate = new Date()) {
        const nextAnniversary = new Date(
            currentDate.getFullYear(),
            weddingDate.getMonth(),
            weddingDate.getDate()
        );

        // If the anniversary has already passed this year, use next year
        if (nextAnniversary <= currentDate) {
            nextAnniversary.setFullYear(currentDate.getFullYear() + 1);
        }

        return this.daysBetween(currentDate, nextAnniversary);
    },

    /**
     * Live countdown to the next anniversary (days, hours, minutes, seconds).
     * Automatically rolls over to the following year once the date arrives.
     */
    calculateAnniversaryCountdown(weddingDate, currentDate = new Date()) {
        const nextAnniversary = new Date(
            currentDate.getFullYear(),
            weddingDate.getMonth(),
            weddingDate.getDate(),
            0, 0, 0, 0
        );

        if (nextAnniversary <= currentDate) {
            nextAnniversary.setFullYear(currentDate.getFullYear() + 1);
        }

        const totalSeconds = Math.max(0, Math.floor((nextAnniversary - currentDate) / 1000));

        return {
            days: Math.floor(totalSeconds / 86400),
            hours: Math.floor((totalSeconds % 86400) / 3600),
            minutes: Math.floor((totalSeconds % 3600) / 60),
            seconds: totalSeconds % 60
        };
    },

    /**
     * Format countdown numbers as two-digit strings, e.g. 5 -> "05"
     */
    padTwoDigits(value) {
        return value.toString().padStart(2, '0');
    },

    /**
     * Format days into a human-readable countdown
     * e.g., "277 days" or "1 year, 67 days"
     */
    formatCountdown(days) {
        if (days <= 0) return 'today';
        if (days === 1) return '1 day';
        if (days < 365) return `${days} days`;

        const years = Math.floor(days / 365);
        const remainingDays = days % 365;

        if (remainingDays === 0) {
            return years === 1 ? '1 year' : `${years} years`;
        }

        return `${years} year${years > 1 ? 's' : ''}, ${remainingDays} day${remainingDays > 1 ? 's' : ''}`;
    },

    /**
     * Format a date to a readable string
     * e.g., "12 September 2018"
     */
    formatDate(date) {
        const options = { day: 'numeric', month: 'long', year: 'numeric' };
        return date.toLocaleDateString('en-US', options);
    },

    /**
     * Format numbers with thousands separator
     */
    formatNumber(num) {
        return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    }
};
