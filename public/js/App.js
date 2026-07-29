/**
 * App.js
 * Alpine.js root state for the DPMPTSP shell.
 * Exposes: v (current view), modal, toast, chatOpen.
 * Dispatches a 'view-changed' CustomEvent on window whenever `v`
 * changes, so other plain-JS modules (AdminChart, etc.) can react
 * without needing to know about Alpine directly.
 */
function appData() {
    return {
        v: 'landing',
        modal: false,
        toast: false,
        toastMsg: '',
        chatOpen: false,
        _toastTimer: null,

        init() {
            // Restore a session if one exists (best-effort, ignores failures).
            try {
                var role = sessionStorage.getItem('role');
                if (role) {
                    this.v = 'dashboard-' + role;
                }
            } catch (e) { /* sessionStorage unavailable — ignore */ }

            this.$watch('v', (value) => {
                window.dispatchEvent(new CustomEvent('view-changed', { detail: value }));
            });

            // Announce the initial view once Alpine has finished mounting.
            window.requestAnimationFrame(() => {
                window.dispatchEvent(new CustomEvent('view-changed', { detail: this.v }));
            });
        },

        fire(msg) {
            this.toastMsg = msg;
            this.toast = true;
            if (this._toastTimer) clearTimeout(this._toastTimer);
            this._toastTimer = setTimeout(() => { this.toast = false; }, 3200);
        },

        openChat() {
            this.chatOpen = true;
            window.dispatchEvent(new CustomEvent('chat-opened'));
        },

        closeChat() {
            this.chatOpen = false;
        }
    };
}