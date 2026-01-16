$(document).ready(function () {
    // Fade In Sidebar for 'Lazy Load' feel
    $('.sidebar').hide().fadeIn(400);

    // Toggle Handler
    $('.nav-section-label').on('click', function () {
        var $headers = $(this);
        var $group = $headers.next('.nav-group-container');

        if ($group.is(':visible')) {
            $group.slideUp(200);
            $headers.removeClass('open');
        } else {
            $group.slideDown(200);
            $headers.addClass('open');
        }
    });
});
