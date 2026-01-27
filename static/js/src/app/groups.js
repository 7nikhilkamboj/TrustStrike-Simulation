var groups = []
var profileType = ""


function switchProfileType(type) {
    profileType = type
    if (type == "") {
        pageHeader = "All Groups"
        $(".page-header").text(pageHeader)
    } else if (type == "email") {
        pageHeader = "Email Groups"
        $(".page-header").text(pageHeader)
    } else if (type == "sms") {
        pageHeader = "SMS Groups"
        $(".page-header").text(pageHeader)
    }
    $("#emptyMessageText").text("No " + profileType + " profiles created yet. Let's create one!")
    load()
}

function edit(id) {
    if (id == -1) {
        location.href = "/group"
    } else {
        location.href = "/group/" + id
    }
}

var deleteGroup = function (id) {
    var group = groups.find(function (x) {
        return x.id === id
    })
    if (!group) {
        return
    }
    Swal.fire({
        title: "Are you sure?",
        text: "This will delete the group. This can't be undone!",
        type: "warning",
        animation: false,
        showCancelButton: true,
        confirmButtonText: "Delete " + escapeHtml(group.name),
        confirmButtonColor: "#428bca",
        reverseButtons: true,
        allowOutsideClick: false,
        preConfirm: function () {
            return new Promise(function (resolve, reject) {
                api.groupId.delete(id)
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
                'Group Deleted!',
                'This group has been deleted!',
                'success'
            );
        }
        $('button:contains("OK")').on('click', function () {
            location.reload()
        })
    })
}

function load() {
    $("#groupTable").hide()
    $("#emptyMessage").hide()
    $("#loading").show()
    api.groups.summary()
        .done(function (response) {
            $("#loading").hide()
            if (response.total > 0) {

                groups = response.groups
                $("#emptyMessage").hide()
                $("#groupTable").show()

                if (profileType == "sms") {
                    groups = groups.filter(t => t.group_type == "sms")
                    labelClass = "label-primary"
                }
                else if (profileType == "email") {
                    groups = groups.filter(t => t.group_type == "email")
                    labelClass = "label-success"
                }
                var groupRows = []
                $.each(groups, function (i, group) {

                    // For colors 
                    var labelClass = "label-default"
                    if (group.group_type == "email" || group.group_type == "qr") {
                        labelClass = "label-success"

                    } else if (group.group_type == "sms") {
                        labelClass = "label-info"
                    }
                    var typeLabel = "<span class='label " + labelClass + "'>" + (group.group_type || "email").toUpperCase() + "</span>"

                    groupRows.push([
                        (window.modifySystem === "true" ? "<input type='checkbox' class='group-checkbox' value='" + group.id + "'>" : ""),
                        escapeHtml(group.name),
                        typeLabel,
                        escapeHtml(group.created_by || ""),
                        escapeHtml(group.num_targets),
                        moment(group.modified_date).format('MMMM Do YYYY, h:mm:ss a'),
                        (window.modifySystem === "true" ? "<button class='btn btn-primary' onclick='edit(" + group.id + ")'>\
                    <i class='fa fa-pencil'></i>\
                    </button>\
                    <button class='btn btn-danger' onclick='deleteGroup(" + group.id + ")'>\
                    <i class='fa fa-trash-o'></i>\
                    </button>" : "")
                    ])
                })
                $("#groupTable").DataTable({
                    destroy: true,
                    columnDefs: [{
                        orderable: false,
                        targets: "no-sort"
                    }],
                    data: groupRows
                });
            } else {
                $("#emptyMessage").show()
            }
        })
        .fail(function () {
            errorFlash("Error fetching groups")
        })
}

$(document).ready(function () {
    switchProfileType("")
});

/* --- Bulk Management --- */

function toggleSelectAll() {
    var checked = $("#selectAllGroups").is(":checked");
    $(".group-checkbox").prop("checked", checked);
}

function bulkDeleteSelected() {
    var ids = [];
    $(".group-checkbox:checked").each(function () {
        ids.push($(this).val());
    });

    if (ids.length === 0) {
        Swal.fire("No selection", "Please select at least one group to delete.", "info");
        return;
    }

    Swal.fire({
        title: "Delete " + ids.length + " groups?",
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

            var promises = ids.map(id => api.groupId.delete(id));
            $.when.apply($, promises).then(function () {
                Swal.fire('Deleted!', 'The selected groups have been removed.', 'success').then(() => {
                    location.reload();
                });
            }).fail(function () {
                Swal.fire('Error', 'Some groups could not be deleted.', 'error').then(() => {
                    location.reload();
                });
            });
        }
    });
}
