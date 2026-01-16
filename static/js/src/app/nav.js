$(document).ready(function () {
    // Initial State: Collapse all groups that don't have an active item
    $('.nav-group-container').each(function () {
        var $group = $(this);
        var $activeItem = $group.find('.nav-item-wrapper.active');

        if ($activeItem.length > 0) {
            $group.addClass('open');
            $group.prev('.nav-section-label').addClass('open');
        } else {
            $group.hide(); // Allow jQuery .hide() for animation logic
            $group.removeClass('open');
            $group.prev('.nav-section-label').removeClass('open');
        }
    });

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
