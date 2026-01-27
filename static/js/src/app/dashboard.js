var campaigns = []
// statuses is a helper map to point result statuses to ui classes
var statuses = {
    "Email Sent": {
        color: "#1abc9c",
        label: "label-success",
        icon: "fa-envelope",
        point: "ct-point-sent"
    },
    "Emails Sent": {
        color: "#1abc9c",
        label: "label-success",
        icon: "fa-envelope",
        point: "ct-point-sent"
    },
    "In progress": {
        label: "label-primary"
    },
    "Queued": {
        label: "label-info"
    },
    "Completed": {
        label: "label-success"
    },
    "Email Opened": {
        color: "#f9bf3b",
        label: "label-warning",
        icon: "fa-envelope",
        point: "ct-point-opened"
    },
    "Email Reported": {
        color: "#45d6ef",
        label: "label-warning",
        icon: "fa-bullhorne",
        point: "ct-point-reported"
    },
    "Clicked Link": {
        color: "#F39C12",
        label: "label-clicked",
        icon: "fa-mouse-pointer",
        point: "ct-point-clicked"
    },
    "Success": {
        color: "#f05b4f",
        label: "label-danger",
        icon: "fa-exclamation",
        point: "ct-point-clicked"
    },
    "Error": {
        color: "#6c7a89",
        label: "label-default",
        icon: "fa-times",
        point: "ct-point-error"
    },
    "Error Sending Email": {
        color: "#6c7a89",
        label: "label-default",
        icon: "fa-times",
        point: "ct-point-error"
    },
    "Submitted Data": {
        color: "#f05b4f",
        label: "label-danger",
        icon: "fa-exclamation",
        point: "ct-point-clicked"
    },
    "Unknown": {
        color: "#6c7a89",
        label: "label-default",
        icon: "fa-question",
        point: "ct-point-error"
    },
    "Sending": {
        color: "#428bca",
        label: "label-primary",
        icon: "fa-spinner",
        point: "ct-point-sending"
    },
    "Campaign Created": {
        label: "label-success",
        icon: "fa-rocket"
    },
    // SMS Statuses
    "SMS Sent": {
        color: "#1abc9c",
        label: "label-success",
        icon: "fa-comment",
        point: "ct-point-sent"
    }
}

var statsMapping = {
    "sent": "Email Sent",
    "opened": "Email Opened",
    // "email_reported": "Email Reported",
    "clicked": "Clicked Link",
    "submitted_data": "Submitted Data",
}

function deleteCampaign(idx) {
    Swal.fire({
        title: "Are you sure?",
        text: "Delete " + campaigns[idx].name + "? This action cannot be undone.",
        icon: "warning",
        showCancelButton: true,
        confirmButtonText: "Delete",
        cancelButtonText: "Cancel",
        confirmButtonClass: "btn btn-danger",
        cancelButtonClass: "btn btn-default",
        buttonsStyling: false,
        customClass: {
            confirmButton: 'btn btn-danger',
            cancelButton: 'btn btn-default'
        },
        showLoaderOnConfirm: true,
        preConfirm: function () {
            return new Promise(function (resolve, reject) {
                api.campaignId.delete(campaigns[idx].id)
                    .done(function (data) {
                        resolve(data)
                    })
                    .fail(function (data) {
                        var msg = "An error occurred";
                        if (data.responseJSON && data.responseJSON.message) {
                            msg = data.responseJSON.message;
                        } else if (data.responseText) {
                            msg = data.responseText;
                        }
                        Swal.showValidationMessage(msg)
                        resolve(false) // Resolve with false to prevent closing, or just let showValidationMessage handle it?

                    })
            })
        },
        allowOutsideClick: false
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

/* Renders a pie chart using the provided chartops */
function renderPieChart(chartopts) {
    return Highcharts.chart(chartopts['elemId'], {
        chart: {
            type: 'pie',
            events: {
                load: function () {
                    var chart = this,
                        rend = chart.renderer,
                        pie = chart.series[0],
                        left = chart.plotLeft + pie.center[0],
                        top = chart.plotTop + pie.center[1];
                    this.innerText = rend.text(chartopts['data'][0].count, left, top).
                        attr({
                            'text-anchor': 'middle',
                            'font-size': '16px',
                            'font-weight': 'bold',
                            'fill': chartopts['colors'][0],
                            'font-family': 'Helvetica,Arial,sans-serif'
                        }).add();
                },
                render: function () {
                    this.innerText.attr({
                        text: chartopts['data'][0].count
                    })
                }
            }
        },
        title: {
            text: chartopts['title']
        },
        plotOptions: {
            pie: {
                innerSize: '80%',
                dataLabels: {
                    enabled: false
                }
            }
        },
        credits: {
            enabled: false
        },
        tooltip: {
            formatter: function () {
                if (this.key == undefined) {
                    return false
                }
                return '<span style="color:' + this.color + '">\u25CF</span>' + this.point.name + ': <b>' + this.y + '%</b><br/>'
            }
        },
        series: [{
            data: chartopts['data'],
            colors: chartopts['colors'],
        }]
    })
}

function generateStatsPieCharts(campaigns) {
    var stats_data = []
    var stats_series_data = {}
    var total = 0

    // Dynamic Stats Mapping
    var mapping = $.extend({}, statsMapping);
    if (currentType === 'sms') {
        mapping['sent'] = "SMS Sent";
        // You can add "SMS Opened" here if applicable, using mapped status
    }

    $.each(campaigns, function (i, campaign) {
        $.each(campaign.stats, function (status, count) {
            if (status == "total") {
                total += count
                return true
            }
            if (!stats_series_data[status]) {
                stats_series_data[status] = count;
            } else {
                stats_series_data[status] += count;
            }
        })
    })
    $.each(stats_series_data, function (status, count) {
        // I don't like this, but I guess it'll have to work.
        // Turns submitted_data into Submitted Data
        if (!(status in mapping)) {
            return true
        }
        status_label = mapping[status]
        if (!status_label) {
            return true
        }
        // Check if status label exists in statuses
        var statusColor = "#dddddd"
        if (statuses[status_label]) {
            statusColor = statuses[status_label].color
        }

        stats_data.push({
            name: status_label,
            y: Math.floor((count / total) * 100),
            count: count
        })
        stats_data.push({
            name: '',
            y: 100 - Math.floor((count / total) * 100)
        })
        // Note: The elemID is hardcoded in HTML as sent_chart, etc.
        // status is 'sent', 'opened', etc.
        // existing code used `status + '_chart'`.
        // So 'sent' -> 'sent_chart'. This matches the ID "sent_chart" in HTML.
        // The TITLE is the label "SMS Sent".
        var stats_chart = renderPieChart({
            elemId: status + '_chart',
            title: status_label,
            name: status,
            data: stats_data,
            colors: [statusColor, "#dddddd"]
        })

        stats_data = []
    });
}

function generateTimelineChart(campaigns) {
    var overview_data = []
    $.each(campaigns, function (i, campaign) {
        var campaign_date = moment.utc(campaign.created_date).local()
        // Add it to the chart data
        campaign.y = 0
        // Clicked events also contain our data submitted events
        campaign.y += campaign.stats.clicked
        campaign.y = Math.floor((campaign.y / campaign.stats.total) * 100)
        // Add the data to the overview chart
        overview_data.push({
            campaign_id: campaign.id,
            name: campaign.name,
            x: campaign_date.valueOf(),
            y: campaign.y
        })
    })
    Highcharts.chart('overview_chart', {
        chart: {
            zoomType: 'x',
            type: 'areaspline'
        },
        title: {
            text: 'Phishing Success Overview'
        },
        xAxis: {
            type: 'datetime',
            dateTimeLabelFormats: {
                second: '%l:%M:%S',
                minute: '%l:%M',
                hour: '%l:%M',
                day: '%b %d, %Y',
                week: '%b %d, %Y',
                month: '%b %Y'
            }
        },
        yAxis: {
            min: 0,
            max: 100,
            title: {
                text: "% of Success"
            }
        },
        tooltip: {
            formatter: function () {
                return Highcharts.dateFormat('%A, %b %d %l:%M:%S %P', new Date(this.x)) +
                    '<br>' + this.point.name + '<br>% Success: <b>' + this.y + '%</b>'
            }
        },
        legend: {
            enabled: false
        },
        plotOptions: {
            series: {
                marker: {
                    enabled: true,
                    symbol: 'circle',
                    radius: 3
                },
                cursor: 'pointer',
                point: {
                    events: {
                        click: function (e) {
                            window.location.href = "/campaigns/" + this.campaign_id
                        }
                    }
                }
            }
        },
        credits: {
            enabled: false
        },
        series: [{
            data: overview_data,
            color: "#f05b4f",
            fillOpacity: 0.5
        }]
    })
}

// Store all campaigns
var all_campaigns = [];
var currentType = "";

function switchCampaignType(type) {
    currentType = type;
    // Render Dashboard with filtered campaigns
    renderDashboard();
}

function renderDashboard() {
    var filtered = all_campaigns.filter(function (c) {
        if (!currentType) return true; // All
        var cType = c.campaign_type || 'email';
        return cType === currentType;
    });

    // Update empty message if needed
    if (filtered.length === 0) {
        $("#dashboard-charts").hide(); // Hide charts but keep controls (in dashboard-view)
        $("#dashboard-table").hide();
        $("#emptyMessage").show();
        $("#emptyMessage .alert").text("No " + (currentType || "active") + " campaigns created yet.");
        $("#dashboard-view").show();
    } else {
        $("#emptyMessage").hide();
        $("#dashboard-charts").show();
        $("#dashboard-table").show();
        $("#dashboard-view").show();

        // Update Table
        var campaignTable = $("#campaignTable").DataTable({
            destroy: true, // Allow re-initialization
            columnDefs: [{
                orderable: false,
                targets: "no-sort"
            },
            {
                className: "color-sent",
                targets: [4]
            },
            {
                className: "color-opened",
                targets: [5]
            },
            {
                className: "color-clicked",
                targets: [6]
            },
            {
                className: "color-success",
                targets: [7]
            }
            ],
            order: [
                [3, "desc"]
            ]
        });
        campaignTable.clear();
        var campaignRows = [];
        $.each(filtered, function (i, campaign) {
            var campaign_date = moment(campaign.created_date).format('MMMM Do YYYY, h:mm:ss a')
            var label = statuses[campaign.status].label || "label-default";
            //section for tooltips on the status of a campaign to show some quick stats
            var launchDate;
            var currentStats = campaign.stats || { total: 0, opened: 0, clicked: 0, submitted_data: 0, error: 0, email_reported: 0, sent: 0 };

            if (moment(campaign.launch_date).isAfter(moment())) {
                launchDate = "Scheduled to start: " + moment(campaign.launch_date).format('MMMM Do YYYY, h:mm:ss a')
                var quickStats = launchDate + "<br><br>" + "Number of recipients: " + currentStats.total
            } else {
                launchDate = "Launch Date: " + moment(campaign.launch_date).format('MMMM Do YYYY, h:mm:ss a')
                var quickStats = launchDate + "<br><br>" + "Number of recipients: " + currentStats.total + "<br><br>" + "Items opened: " + currentStats.opened + "<br><br>" + "Items clicked: " + currentStats.clicked + "<br><br>" + "Submitted Credentials: " + currentStats.submitted_data + "<br><br>" + "Errors : " + currentStats.error
            }
            // Render campaign type with styled tags
            var typeLabel = "";
            var cType = campaign.campaign_type || "email";
            if (cType === "email") {
                typeLabel = '<span class="label label-success">EMAIL</span>';
            } else if (cType === "sms") {
                typeLabel = '<span class="label label-info">SMS</span>';
            } else if (cType === "qr") {
                typeLabel = '<span class="label label-primary">QR</span>';
            } else {
                // Fallback for undefined/null
                typeLabel = '<span class="label label-default">UNKNOWN</span>';
            }

            campaignRows.push([
                escapeHtml(campaign.name),
                typeLabel,
                escapeHtml(campaign.created_by || ""),
                campaign_date,
                currentStats.sent,
                currentStats.opened,
                currentStats.clicked,
                currentStats.submitted_data,
                // campaign.stats.email_reported,
                "<span class=\"label " + label + "\" data-toggle=\"tooltip\" data-placement=\"right\" data-html=\"true\" title=\"" + quickStats + "\">" + campaign.status + "</span>",
                "<a class='btn btn-primary' href='/campaigns/" + campaign.id + "' data-toggle='tooltip' data-placement='left' title='View Results'>\
            <i class='fa fa-bar-chart'></i>\
            </a>\
            " + (modifySystem ? "<button class='btn btn-danger' onclick='deleteCampaign(" + i + ")' data-toggle='tooltip' data-placement='left' title='Delete Campaign'>\
            <i class='fa fa-trash-o'></i>\
            </button>" : "")
            ])
        })
        campaignTable.rows.add(campaignRows).draw()
        $('[data-toggle="tooltip"]').tooltip()

        // Update charts with filtered data
        generateStatsPieCharts(filtered)
        generateTimelineChart(filtered)

        // Update global campaigns variable for deleteCampaign to work correctly
        campaigns = filtered; // This ensures campaigns[i] matches the row index 'i' passed to deleteCampaign
    }
}

$(document).ready(function () {
    Highcharts.setOptions({
        global: {
            useUTC: false
        }
    })
    api.campaigns.summary()
        .success(function (data) {
            $("#loading").hide()
            all_campaigns = data.campaigns
            // Default to all
            switchCampaignType('');
        })
        .error(function () {
            errorFlash("Error fetching campaigns")
        })
})
