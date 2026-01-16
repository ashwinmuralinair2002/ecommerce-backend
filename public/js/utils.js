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
