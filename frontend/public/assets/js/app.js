document.addEventListener('DOMContentLoaded', function () {
    const toastContainer = document.getElementById('toastContainer');
    const loadingOverlay = document.getElementById('loadingOverlay');

    window.showToast = function (message, type = 'success') {
        const toastEl = document.createElement('div');
        toastEl.className = `toast align-items-center text-bg-${type} border-0`;
        toastEl.setAttribute('role', 'alert');
        toastEl.innerHTML = `<div class="d-flex"><div class="toast-body">${message}</div><button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button></div>`;
        toastContainer.appendChild(toastEl);
        const toast = new bootstrap.Toast(toastEl, {delay: 2500});
        toast.show();
        toastEl.addEventListener('hidden.bs.toast', function () {
            toastEl.remove();
        });
    };

    window.showLoading = function () {
        loadingOverlay.classList.add('show');
    };

    window.hideLoading = function () {
        loadingOverlay.classList.remove('show');
    };

    document.querySelectorAll('[data-confirm-delete]').forEach(function (button) {
        button.addEventListener('click', function (event) {
            event.preventDefault();
            const url = this.getAttribute('href');
            if (confirm('Delete this record?')) {
                window.location.href = url;
            }
        });
    });
});
