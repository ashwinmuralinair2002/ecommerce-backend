/**
 * Global Notification Utilities
 * Requires SweetAlert2 to be loaded
 */

// Show a non-blocking toast notification
window.showToast = function (title, icon = 'success') {
    const Toast = Swal.mixin({
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 3000,
        timerProgressBar: true,
        didOpen: (toast) => {
            toast.addEventListener('mouseenter', Swal.stopTimer);
            toast.addEventListener('mouseleave', Swal.resumeTimer);
        }
    });

    Toast.fire({
        icon: icon,
        title: title
    });
};

// Show a blocking confirmation modal
// Usage: confirmAction({ title: '...', text: '...', confirmButtonText: 'Yes, delete it!' }, () => { // delete logic })
window.confirmAction = function (options, onConfirm) {
    const defaultOptions = {
        title: 'Are you sure?',
        text: "You won't be able to revert this!",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33', // Red for destructive by default
        cancelButtonColor: '#3085d6',
        confirmButtonText: 'Yes, do it!'
    };

    const config = { ...defaultOptions, ...options };

    Swal.fire(config).then((result) => {
        if (result.isConfirmed) {
            onConfirm();
        }
    });
};

// Show a simple blocking alert (replacement for critical errors)
window.showError = function (title, text) {
    Swal.fire({
        icon: 'error',
        title: title,
        text: text
    });
};

// Toggle Password Visibility
// Usage: onclick="togglePasswordVisibility('passwordInputId', 'iconSpanId')"
window.togglePasswordVisibility = function (inputId, iconId) {
    const input = document.getElementById(inputId);
    const iconContainer = document.getElementById(iconId);

    if (!input || !iconContainer) return;

    if (input.type === 'password') {
        input.type = 'text';
        // Show "Eye Off" icon (indicating click to hide, or that it is currently visible)
        iconContainer.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>';
    } else {
        input.type = 'password';
        // Show "Eye" icon (indicating click to show)
        iconContainer.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>';
    }
};
