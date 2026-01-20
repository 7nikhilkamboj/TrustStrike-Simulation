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
var campaignType = "" // Default to All

// Switch campaign type view
function switchCampaignType(type) {
    campaignType = type
    var pageHeader = "All Campaigns"
    if (type == "email") {
        pageHeader = "Email Campaigns"
    } else if (type == "qr") {
        pageHeader = "QR Campaigns"
    } else if (type == "sms") {
        pageHeader = "SMS Campaigns"
    }
    $("#page-header").text(pageHeader)
    $("#emptyMessageText").text("No " + (campaignType || "active") + " campaigns created yet. Let's create one!")
    loadCampaigns()
}

function deleteCampaign(id, name) {
    Swal.fire({
        title: "Are you sure?",
        text: "This will delete the campaign " + name + ". This can't be undone!",
        type: "warning",
        animation: false,
        showCancelButton: true,
        confirmButtonText: "Delete",
        confirmButtonColor: "#428bca",
        reverseButtons: true,
        allowOutsideClick: false,
        preConfirm: function () {
            return new Promise(function (resolve, reject) {
                api.campaignId.delete(id)
                    .done(function (msg) {
                        resolve(msg)
                    })
                    .fail(function (data) {
                        var message = "An error occurred"
                        if (data.responseJSON && data.responseJSON.message) {
                            message = data.responseJSON.message
                        } else if (data.responseText) {
                            message = data.responseText
                        }
                        Swal.showValidationMessage(message)
                        resolve(false)
                    })
            })
        }
    }).then(function (result) {
        if (result.value) {
            Swal.fire(
                'Campaign Deleted!',
                'This campaign has been deleted!',
                'success'
            ).then(function () {
                location.reload();
            });
        }
    })
}

function copy(idx) {
    location.href = "/campaign?copy=" + campaigns[idx].id;
}

function loadCampaigns() {
    $("#loading").show()
    $("#campaignTable").hide()
    $("#campaignTableArchive").hide()
    $("#emptyMessage").hide()

    var p;
    // Utilize summary endpoint for consistent data structure across all types
    p = api.campaigns.summary("?campaign_type=" + campaignType)

    p.done(function (data) {
        campaigns = data.campaigns || []
        $("#loading").hide()

        // Destroy existing DataTables if they exist
        if ($.fn.DataTable.isDataTable("#campaignTable")) {
            $("#campaignTable").DataTable().destroy();
        }
        if ($.fn.DataTable.isDataTable("#campaignTableArchive")) {
            $("#campaignTableArchive").DataTable().destroy();
        }
        // Clear table bodies
        $("#campaignTable tbody").empty();
        $("#campaignTableArchive tbody").empty();

        if (campaigns && campaigns.length > 0) {
            $("#campaignTable").show()
            $("#campaignTableArchive").show()

            activeCampaignsTable = $("#campaignTable").DataTable({
                columnDefs: [{
                    orderable: false,
                    targets: "no-sort"
                }],
                order: [
                    [4, "desc"] // Sort by Created Date (index 4)
                ]
            });
            archivedCampaignsTable = $("#campaignTableArchive").DataTable({
                columnDefs: [{
                    orderable: false,
                    targets: "no-sort"
                }],
                order: [
                    [3, "desc"] // Archived table
                ]
            });
            rows = {
                'active': [],
                'archived': []
            }
            $.each(campaigns, function (i, campaign) {
                label = labels[campaign.status] || "label-default";

                // Color badges for Type
                var typeLabelClass = "label-default"
                if (campaign.campaign_type == "email") typeLabelClass = "label-success"
                else if (campaign.campaign_type == "qr") typeLabelClass = "label-primary"
                else if (campaign.campaign_type == "sms") typeLabelClass = "label-info"

                //section for tooltips on the status of a campaign to show some quick stats
                var stats = campaign.stats || { total: 0, sent: 0, opened: 0, clicked: 0, submitted_data: 0, error: 0, email_reported: 0 };
                var launchDate;
                var currentType = (campaign.campaign_type || "email").toLowerCase();

                if (moment(campaign.launch_date).isAfter(moment())) {
                    launchDate = "Scheduled to start: " + moment(campaign.launch_date).format('MMMM Do YYYY, h:mm:ss a')
                    var quickStats = launchDate + "<br><br>" + "Number of recipients: " + stats.total
                } else {
                    launchDate = "Launch Date: " + moment(campaign.launch_date).format('MMMM Do YYYY, h:mm:ss a')
                    var quickStats = launchDate + "<br><br>" + "Number of recipients: " + stats.total + "<br><br>" + (currentType == "sms" ? "SMS Sent: " : "Emails Sent: ") + stats.sent + "<br><br>" + (currentType == "sms" ? "SMS Clicked: " : "Clicked: ") + stats.clicked + "<br><br>" + "Submitted Credentials: " + stats.submitted_data + "<br><br>" + "Errors : " + stats.error + "<br><br>" + "Reported : " + stats.email_reported
                }

                // Construct Row: Checkbox, Name, Type, Created By, Created Date, Status, Actions
                var row = [
                    "<input type='checkbox' class='campaign-checkbox index-checkbox' value='" + campaign.id + "' data-status='" + campaign.status + "' data-name='" + escapeHtml(campaign.name) + "'>",
                    escapeHtml(campaign.name),
                    "<span class='label " + typeLabelClass + "'>" + (campaign.campaign_type || "EMAIL").toUpperCase() + "</span>",
                    escapeHtml(campaign.created_by || ""),
                    moment(campaign.created_date).format('MMMM Do YYYY, h:mm:ss a'),
                    "<span class=\"label " + label + "\" data-toggle=\"tooltip\" data-placement=\"right\" data-html=\"true\" title=\"" + quickStats + "\">" + campaign.status + "</span>",
                    "<div style='display: flex; justify-content: flex-end; white-space: nowrap; gap: 5px;'>\
                        <a class='btn btn-primary' href='/campaigns/" + campaign.id + "' data-toggle='tooltip' data-placement='left' title='View Results'>\
                            <i class='fa fa-bar-chart'></i>\
                        </a>\
                        <button class='btn btn-primary' onclick='copy(" + i + ")' data-toggle='tooltip' data-placement='left' title='Copy Campaign'>\
                            <i class='fa fa-copy'></i>\
                        </button>\
                        <button class='btn btn-danger' onclick='deleteCampaign(" + campaign.id + ", \"" + escapeHtml(campaign.name).replace(/"/g, '&quot;') + "\")' data-toggle='tooltip' data-placement='left' title='Delete Campaign'>\
                            <i class='fa fa-trash-o'></i>\
                        </button>\
                    </div>"
                ]

                var rowArchive = [
                    "<input type='checkbox' class='campaign-checkbox archive-checkbox' value='" + campaign.id + "'>",
                    escapeHtml(campaign.name),
                    escapeHtml(campaign.created_by || ""),
                    moment(campaign.created_date).format('MMMM Do YYYY, h:mm:ss a'),
                    "<span class=\"label " + label + "\" data-toggle=\"tooltip\" data-placement=\"right\" data-html=\"true\" title=\"" + quickStats + "\">" + campaign.status + "</span>",
                    row[6] // Actions
                ]

                if (campaign.status == 'Completed') {
                    rows['archived'].push(rowArchive)
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
        .fail(function () {
            $("#loading").hide()
            errorFlash("Error fetching campaigns")
        })
}

$(document).ready(function () {
    // Determine campaign type from URL
    campaignType = ""
    var pageHeader = "All Campaigns"
    if (window.location.pathname.indexOf("sms") !== -1) {
        campaignType = "sms"
        pageHeader = "SMS Campaigns"
    } else if (window.location.pathname.indexOf("qr") !== -1) {
        campaignType = "qr"
        pageHeader = "QR Campaigns"
    }

    // Auto-select the filter button based on type
    if (campaignType) {
        $("#type_" + campaignType).parent().addClass("active").siblings().removeClass("active");
    } else {
        $("#type_all").parent().addClass("active").siblings().removeClass("active");
    }

    switchCampaignType(campaignType)
})

/* --- Bulk Management --- */

function toggleSelectAll(type) {
    if (type === 'active') {
        var checked = $("#selectAllActive").is(":checked");
        $(".index-checkbox").prop("checked", checked);
    } else {
        var checked = $("#selectAllArchived").is(":checked");
        $(".archive-checkbox").prop("checked", checked);
    }
}

function getSelectedIds() {
    var ids = [];
    $(".campaign-checkbox:checked").each(function () {
        ids.push($(this).val());
    });
    return ids;
}

function bulkDeleteSelected() {
    var ids = getSelectedIds();
    if (ids.length === 0) {
        Swal.fire("No selection", "Please select at least one campaign to delete.", "info");
        return;
    }

    Swal.fire({
        title: "Delete " + ids.length + " campaigns?",
        text: "This action cannot be undone!",
        type: "warning",
        showCancelButton: true,
        confirmButtonText: "Delete",
        confirmButtonColor: "#d9534f",
        reverseButtons: true
    }).then(function (result) {
        if (result.value) {
            Swal.fire({
                title: 'Deleting...',
                allowOutsideClick: false,
                onBeforeOpen: () => {
                    Swal.showLoading();
                }
            });

            var promises = ids.map(id => api.campaignId.delete(id));
            $.when.apply($, promises).then(function () {
                Swal.fire('Deleted!', 'The selected campaigns have been removed.', 'success').then(() => {
                    location.reload();
                });
            }).fail(function () {
                Swal.fire('Error', 'Some campaigns could not be deleted.', 'error').then(() => {
                    location.reload();
                });
            });
        }
    });
}

function bulkCompleteSelected() {
    var ids = [];
    $(".index-checkbox:checked").each(function () {
        if ($(this).data("status") !== "Completed") {
            ids.push($(this).val());
        }
    });

    if (ids.length === 0) {
        Swal.fire("No selection", "Please select at least one ongoing campaign to complete.", "info");
        return;
    }

    Swal.fire({
        title: "Complete " + ids.length + " campaigns?",
        text: "This will end the selected campaigns.",
        type: "question",
        showCancelButton: true,
        confirmButtonText: "Complete",
        confirmButtonColor: "#5cb85c"
    }).then(function (result) {
        if (result.value) {
            Swal.fire({
                title: 'Completing...',
                allowOutsideClick: false,
                onBeforeOpen: () => {
                    Swal.showLoading();
                }
            });

            var promises = ids.map(id => api.campaignId.complete(id));
            $.when.apply($, promises).then(function () {
                Swal.fire('Updated!', 'The selected campaigns have been completed.', 'success').then(() => {
                    location.reload();
                });
            }).fail(function () {
                Swal.fire('Error', 'Some campaigns could not be updated.', 'error').then(() => {
                    location.reload();
                });
            });
        }
    });
}

function bulkActionAll(status, action) {
    var targetCampaigns = campaigns.filter(c => c.status === status);
    if (targetCampaigns.length === 0) {
        Swal.fire("Nothing found", "There are no campaigns with status: " + status, "info");
        return;
    }

    var actionVerb = action === 'delete' ? 'Delete' : 'Complete';
    var textSuffix = action === 'delete' ? 'This cannot be undone!' : 'This will end these campaigns.';

    Swal.fire({
        title: actionVerb + " all " + targetCampaigns.length + " " + (status === 'In progress' ? 'ongoing' : 'completed') + " campaigns?",
        text: textSuffix,
        type: "warning",
        showCancelButton: true,
        confirmButtonText: actionVerb,
        confirmButtonColor: action === 'delete' ? "#d9534f" : "#5cb85c"
    }).then(function (result) {
        if (result.value) {
            Swal.fire({
                title: 'Processing...',
                allowOutsideClick: false,
                onBeforeOpen: () => {
                    Swal.showLoading();
                }
            });

            var promises = targetCampaigns.map(c => {
                if (action === 'delete') return api.campaignId.delete(c.id);
                return api.campaignId.complete(c.id);
            });

            $.when.apply($, promises).then(function () {
                Swal.fire('Finished!', 'Action completed successfully.', 'success').then(() => {
                    location.reload();
                });
            }).fail(function () {
                Swal.fire('Mixed Results', 'Some operations may have failed.', 'warning').then(() => {
                    location.reload();
                });
            });
        }
    });
}

// Start new campaign - first check EC2 status, start if needed, then navigate to campaign editor
function startNewCampaign() {
    // Show initial status check
    Swal.fire({
        title: "Checking Server Status",
        html: '<p style="margin-top: 15px; font-size: 14px;">Checking EC2 instance status...</p>',
        allowOutsideClick: false,
        showConfirmButton: false,
        onOpen: function () {
            Swal.showLoading();

            function checkStatus() {
                $.ajax({
                    url: "/api/simulationserver/ec2/status",
                    method: "GET",
                    success: function (statusResponse) {
                        var state = statusResponse.data && statusResponse.data.state;
                        var publicIP = statusResponse.data && statusResponse.data.public_ip;

                        if (state === "running" && publicIP) {
                            // EC2 is already running - go directly to campaign editor
                            Swal.fire({
                                title: "Server Ready!",
                                text: "Simulation server is already running.",
                                icon: "success",
                                timer: 1500,
                                showConfirmButton: false
                            }).then(function () {
                                location.href = '/campaign';
                            });
                        } else if (state === "stopping" || state === "shutting-down") {
                            // EC2 is stopping - wait for it to stop
                            Swal.update({
                                title: "Waiting for Shutdown",
                                html: '<p style="margin-top: 15px; font-size: 14px;">Server is currently stopping. Please wait...</p>'
                            });
                            setTimeout(checkStatus, 3000);
                        } else {
                            // EC2 is stopped (or other state) - start it
                            Swal.close();
                            startEC2WithProgressBar();
                        }
                    },
                    error: function () {
                        // If status check fails, try to start anyway
                        Swal.close();
                        startEC2WithProgressBar();
                    }
                });
            }

            checkStatus();
        }
    });
}

// Start EC2 with animated progress bar
function startEC2WithProgressBar() {
    var progress = 0;
    var progressMessages = [
        { percent: 0, text: "Starting EC2 instance..." },
        { percent: 20, text: "Instance initializing..." },
        { percent: 35, text: "Loading modules..." },
        { percent: 50, text: "Configuring server..." },
        { percent: 65, text: "Setting up phishlets..." },
        { percent: 80, text: "Waiting for SSH..." },
        { percent: 90, text: "Starting simulation engine..." },
        { percent: 100, text: "Ready!" }
    ];

    // Show progress modal
    Swal.fire({
        title: "Preparing Simulation Server",
        html: '<div class="progress" style="height: 25px; margin-top: 20px;">' +
            '<div id="ec2-progress-bar" class="progress-bar progress-bar-striped active" role="progressbar" style="width: 0%; font-size: 14px;">0%</div>' +
            '</div>' +
            '<p id="ec2-status-text" style="margin-top: 15px; font-size: 14px;">Starting EC2 instance...</p>',
        allowOutsideClick: false,
        showConfirmButton: false,
        onOpen: function () {
            // Animate progress while waiting for API
            var progressInterval = setInterval(function () {
                if (progress < 85) {
                    progress += Math.random() * 5;
                    if (progress > 85) progress = 85;
                    updateEC2ProgressUI(progress, progressMessages);
                }
            }, 500);

            // Make the actual EC2 start API call
            $.ajax({
                url: "/api/simulationserver/ec2/start",
                method: "POST",
                contentType: "application/json",
                data: JSON.stringify({ start_evil: true, ignore_throttle: true }),
                timeout: 300000, // 5 minute timeout
                success: function (response) {
                    clearInterval(progressInterval);
                    // Complete the progress animation
                    animateEC2ProgressTo(100, progressMessages, function () {
                        Swal.close();
                        // Navigate to campaign editor
                        location.href = '/campaign';
                    });
                },
                error: function (xhr) {
                    clearInterval(progressInterval);
                    Swal.close();
                    var msg = xhr.responseJSON ? xhr.responseJSON.message : "Failed to start EC2 instance";
                    Swal.fire("Error", msg, "error");
                }
            });
        }
    });
}

function updateEC2ProgressUI(percent, messages) {
    var intPercent = Math.round(percent);
    $("#ec2-progress-bar").css("width", intPercent + "%").text(intPercent + "%");

    // Find appropriate status message
    var statusText = "Processing...";
    for (var i = messages.length - 1; i >= 0; i--) {
        if (intPercent >= messages[i].percent) {
            statusText = messages[i].text;
            break;
        }
    }
    $("#ec2-status-text").text(statusText);
}

function animateEC2ProgressTo(target, messages, callback) {
    var current = parseInt($("#ec2-progress-bar").css("width")) / $("#ec2-progress-bar").parent().width() * 100 || 0;
    var interval = setInterval(function () {
        current += 3;
        if (current >= target) {
            current = target;
            clearInterval(interval);
            updateEC2ProgressUI(current, messages);
            setTimeout(callback, 500);
        } else {
            updateEC2ProgressUI(current, messages);
        }
    }, 50);
}

