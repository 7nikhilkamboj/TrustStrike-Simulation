// labels is a map of campaign statuses to
// CSS classes
var labels = {
    "In progress": "label-primary",
    "Queued": "label-info",
    "Completed": "label-success",
    "Emails Sent": "label-success",
    "Error": "label-danger"
}

var campaigns = []
var campaign = {}

// Launch attempts to POST to /campaigns/
function launch() {
    Swal.fire({
        title: "Are you sure?",
        text: "This will schedule the campaign to be launched.",
        type: "question",
        animation: false,
        showCancelButton: true,
        confirmButtonText: "Launch",
        confirmButtonColor: "#428bca",
        reverseButtons: true,
        allowOutsideClick: false,
        showLoaderOnConfirm: true,
        preConfirm: function () {
            return new Promise(function (resolve, reject) {
                groups = []
                $("#users").select2("data").forEach(function (group) {
                    groups.push({
                        name: group.text
                    });
                })
                // Validate our fields
                var send_by_date = $("#send_by_date").val()
                if (send_by_date != "") {
                    send_by_date = moment(send_by_date, "MMMM Do YYYY, h:mm a").utc().format()
                }
                campaign = {
                    name: $("#name").val(),
                    template: {
                        name: $("#template").select2("data")[0].text
                    },
                    url: $("#url").val(),
                    page: {
                        name: ""
                    },
                    smtp: {
                        name: $("#profile").select2("data")[0].text
                    },
                    launch_date: moment($("#launch_date").val(), "MMMM Do YYYY, h:mm a").utc().format(),
                    send_by_date: send_by_date || null,
                    groups: groups,
                    groups: groups,
                    campaign_type: "qr",
                    qr_size: parseInt($("#qr_size").val()) || 250,
                    attack_objective: $("#attack_objective").val(),
                    redirect_url: $("#redirect_url").val()
                }
                // Submit the campaign
                api.campaigns.post(campaign)
                    .success(function (data) {
                        resolve()
                        campaign = data
                    })
                    .error(function (data) {
                        $("#modal\\.flashes").empty().append("<div style=\"text-align:center\" class=\"alert alert-danger\">\
            <i class=\"fa fa-exclamation-circle\"></i> " + data.responseJSON.message + "</div>")
                        Swal.close()
                    })
            })
        }
    }).then(function (result) {
        if (result.value) {
            Swal.fire(
                'Campaign Scheduled!',
                'This campaign has been scheduled for launch!',
                'success'
            );
        }
        $('button:contains("OK")').on('click', function () {
            window.location = "/qr_campaigns"
        })
    })
}

// Attempts to send a test email by POSTing to /campaigns/
function sendTestEmail() {
    var test_email_request = {
        template: {
            name: $("#template").select2("data")[0].text
        },
        first_name: $("input[name=to_first_name]").val(),
        last_name: $("input[name=to_last_name]").val(),
        email: $("input[name=to_email]").val(),
        position: $("input[name=to_position]").val(),
        url: $("#url").val(),
        page: {
            name: ""
        },
        smtp: {
            name: $("#profile").select2("data")[0].text
        },
        qr_size: parseInt($("#qr_size").val()) || 250
    }
    btnHtml = $("#sendTestModalSubmit").html()
    $("#sendTestModalSubmit").html('<i class="fa fa-spinner fa-spin"></i> Sending')
    // Send the test email
    api.send_test_email(test_email_request)
        .success(function (data) {
            $("#sendTestEmailModal\\.flashes").empty().append("<div style=\"text-align:center\" class=\"alert alert-success\">\
            <i class=\"fa fa-check-circle\"></i> Email Sent!</div>")
            $("#sendTestModalSubmit").html(btnHtml)
        })
        .error(function (data) {
            $("#sendTestEmailModal\\.flashes").empty().append("<div style=\"text-align:center\" class=\"alert alert-danger\">\
            <i class=\"fa fa-exclamation-circle\"></i> " + data.responseJSON.message + "</div>")
            $("#sendTestModalSubmit").html(btnHtml)
        })
}

function dismiss() {
    $("#modal\\.flashes").empty();
    $("#name").val("");
    $("#template").val("").change();
    $("#page").val("").change();
    $("#url").val("");
    $("#qrcode").empty();
    $("#profile").val("").change();
    $("#users").val("").change();
    $("#modal").modal('hide');
}

function deleteCampaign(idx) {
    Swal.fire({
        title: "Are you sure?",
        text: "This will delete the campaign. This can't be undone!",
        type: "warning",
        animation: false,
        showCancelButton: true,
        confirmButtonText: "Delete " + campaigns[idx].name,
        confirmButtonColor: "#428bca",
        reverseButtons: true,
        allowOutsideClick: false,
        preConfirm: function () {
            return new Promise(function (resolve, reject) {
                api.campaignId.delete(campaigns[idx].id)
                    .success(function (msg) {
                        resolve()
                    })
                    .error(function (data) {
                        reject(data.responseJSON.message)
                    })
            })
        }
    }).then(function (result) {
        if (result.value) {
            Swal.fire(
                'Campaign Deleted!',
                'This campaign has been deleted!',
                'success'
            );
        }
        $('button:contains("OK")').on('click', function () {
            location.reload()
        })
    })
}

function setupOptions() {
    api.groups.summary()
        .success(function (summaries) {
            groups = summaries.groups
            if (groups.length == 0) {
                modalError("No groups found!")
                return false;
            } else {
                var group_s2 = $.map(groups, function (obj) {
                    obj.text = obj.name
                    obj.title = obj.num_targets + " targets"
                    return obj
                });
                console.log(group_s2)
                $("#users.form-control").select2({
                    placeholder: "Select Groups",
                    data: group_s2,
                });
            }
        });
    api.templates.get()
        .success(function (templates) {
            if (templates.length == 0) {
                modalError("No templates found!")
                return false
            } else {
                var template_s2 = $.map(templates, function (obj) {
                    obj.text = obj.name
                    return obj
                });
                var template_select = $("#template.form-control")
                template_select.select2({
                    placeholder: "Select a Template",
                    data: template_s2,
                });
                if (templates.length === 1) {
                    template_select.val(template_s2[0].id)
                    template_select.trigger('change.select2')
                }
            }
        });
    api.SMTP.get()
        .success(function (profiles) {
            if (profiles.length == 0) {
                modalError("No profiles found!")
                return false
            } else {
                var profile_s2 = $.map(profiles, function (obj) {
                    obj.text = obj.name
                    return obj
                });
                var profile_select = $("#profile.form-control")
                profile_select.select2({
                    placeholder: "Select a Sending Profile",
                    data: profile_s2,
                }).select2("val", profile_s2[0]);
                if (profiles.length === 1) {
                    profile_select.val(profile_s2[0].id)
                    profile_select.trigger('change.select2')
                }
            }
        });
}

function edit(campaign) {
    setupOptions();
}

// Update QR code when size changes
$("#qr_size").on("keyup change", function () {
    generateQR($("#url").val());
});

function generateQR(url) {
    $("#qrcode").empty();
    var size = parseInt($("#qr_size").val()) || 250;
    if (url) {
        new QRCode(document.getElementById("qrcode"), {
            text: url,
            width: size,
            height: size,
            colorDark: "#000000",
            colorLight: "#ffffff",
            correctLevel: QRCode.CorrectLevel.H
        });
    }
}

$(document).ready(function () {
    $("#url").on("input", function () {
        generateQR($(this).val());
    });

    $("#launch_date").datetimepicker({
        "widgetPositioning": {
            "vertical": "bottom"
        },
        "showTodayButton": true,
        "defaultDate": moment(),
        "format": "MMMM Do YYYY, h:mm a"
    })
    $("#send_by_date").datetimepicker({
        "widgetPositioning": {
            "vertical": "bottom"
        },
        "showTodayButton": true,
        "useCurrent": false,
        "format": "MMMM Do YYYY, h:mm a"
    })
    // Setup multiple modals
    // Code based on http://miles-by-motorcycle.com/static/bootstrap-modal/index.html
    $('.modal').on('hidden.bs.modal', function (event) {
        $(this).removeClass('fv-modal-stack');
        $('body').data('fv_open_modals', $('body').data('fv_open_modals') - 1);
    });
    $('.modal').on('shown.bs.modal', function (event) {
        // Keep track of the number of open modals
        if (typeof ($('body').data('fv_open_modals')) == 'undefined') {
            $('body').data('fv_open_modals', 0);
        }
        // if the z-index of this modal has been set, ignore.
        if ($(this).hasClass('fv-modal-stack')) {
            return;
        }
        $(this).addClass('fv-modal-stack');
        // Increment the number of open modals
        $('body').data('fv_open_modals', $('body').data('fv_open_modals') + 1);
        // Setup the appropriate z-index
        $(this).css('z-index', 1040 + (10 * $('body').data('fv_open_modals')));
        $('.modal-backdrop').not('.fv-modal-stack').css('z-index', 1039 + (10 * $('body').data('fv_open_modals')));
        $('.modal-backdrop').not('fv-modal-stack').addClass('fv-modal-stack');
    });
    // Scrollbar fix - https://stackoverflow.com/questions/19305821/multiple-modals-overlay
    $(document).on('hidden.bs.modal', '.modal', function () {
        $('.modal:visible').length && $(document.body).addClass('modal-open');
    });
    $('#modal').on('hidden.bs.modal', function (event) {
        dismiss()
    });
    api.campaigns.summary("?campaign_type=qr")
        .success(function (data) {
            campaigns = data.campaigns
            $("#loading").hide()
            if (campaigns.length > 0) {
                $("#campaignTable").show()
                $("#campaignTableArchive").show()

                activeCampaignsTable = $("#campaignTable").DataTable({
                    columnDefs: [{
                        orderable: false,
                        targets: "no-sort"
                    }],
                    order: [
                        [1, "desc"]
                    ]
                });
                archivedCampaignsTable = $("#campaignTableArchive").DataTable({
                    columnDefs: [{
                        orderable: false,
                        targets: "no-sort"
                    }],
                    order: [
                        [1, "desc"]
                    ]
                });
                rows = {
                    'active': [],
                    'archived': []
                }
                $.each(campaigns, function (i, campaign) {
                    label = labels[campaign.status] || "label-default";

                    //section for tooltips on the status of a campaign to show some quick stats
                    var launchDate;
                    if (moment(campaign.launch_date).isAfter(moment())) {
                        launchDate = "Scheduled to start: " + moment(campaign.launch_date).format('MMMM Do YYYY, h:mm:ss a')
                        var quickStats = launchDate + "<br><br>" + "Number of recipients: " + campaign.stats.total
                    } else {
                        launchDate = "Launch Date: " + moment(campaign.launch_date).format('MMMM Do YYYY, h:mm:ss a')
                        var quickStats = launchDate + "<br><br>" + "Number of recipients: " + campaign.stats.total + "<br><br>" + "Emails opened: " + campaign.stats.opened + "<br><br>" + "Emails clicked: " + campaign.stats.clicked + "<br><br>" + "Submitted Credentials: " + campaign.stats.submitted_data + "<br><br>" + "Errors : " + campaign.stats.error + "<br><br>" + "Reported : " + campaign.stats.email_reported
                    }

                    var row = [
                        escapeHtml(campaign.name),
                        moment(campaign.created_date).format('MMMM Do YYYY, h:mm:ss a'),
                        "<span class=\"label " + label + "\" data-toggle=\"tooltip\" data-placement=\"right\" data-html=\"true\" title=\"" + quickStats + "\">" + campaign.status + "</span>",
                        "<div class='pull-right'><a class='btn btn-primary' href='/campaigns/" + campaign.id + "' data-toggle='tooltip' data-placement='left' title='View Results'>\
                    <i class='fa fa-bar-chart'></i>\
                    </a>\
                    <button class='btn btn-danger' onclick='deleteCampaign(" + i + ")' data-toggle='tooltip' data-placement='left' title='Delete Campaign'>\
                    <i class='fa fa-trash-o'></i>\
                    </button></div>"
                    ]
                    if (campaign.status == 'Completed') {
                        rows['archived'].push(row)
                    } else {
                        rows['active'].push(row)
                    }
                })
                activeCampaignsTable.rows.add(rows['active']).draw()
                archivedCampaignsTable.rows.add(rows['archived']).draw()
                $('[data-toggle="tooltip"]').tooltip()
            } else {
                $("#emptyMessage").show()
            }
        })
        .error(function () {
            $("#loading").hide()
            errorFlash("Error fetching campaigns")
        })
    // Select2 Defaults
    $.fn.select2.defaults.set("width", "100%");
    $.fn.select2.defaults.set("dropdownParent", $("#modal_body"));
    $.fn.select2.defaults.set("theme", "bootstrap");
    $.fn.select2.defaults.set("sorter", function (data) {
        return data.sort(function (a, b) {
            if (a.text.toLowerCase() > b.text.toLowerCase()) {
                return 1;
            }
            if (a.text.toLowerCase() < b.text.toLowerCase()) {
                return -1;
            }
            return 0;
        });
    });

    // Handle Attack Objective change
    $(document).on("change", "#attack_objective", function () {
        var objective = $(this).val();
        if (objective == "Tracking only") {
            // Show URL (Lure URL) AND Redirect URL
            $('label[for="url"]').show();
            $("#url").show();
            $("#redirect_url_group").show();
        } else {
            $('label[for="url"]').show();
            $("#url").show();
            $("#redirect_url_group").hide();
        }
    });
})
