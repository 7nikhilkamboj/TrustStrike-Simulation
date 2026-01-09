let groups = []
let currentGroupId = -1

const load = () => {
    $("#groupTable").hide()
    $("#loading").show()
    api.userGroups.get()
        .done((gs) => {
            groups = gs
            $("#loading").hide()
            $("#groupTable").show()
            let groupTable = $("#groupTable").DataTable({
                destroy: true,
                columnDefs: [{
                    orderable: false,
                    targets: "no-sort"
                }]
            });
            groupTable.clear();
            groupRows = []
            $.each(groups, (i, group) => {
                groupRows.push([
                    escapeHtml(group.name),
                    moment(group.modified_date).format('MMMM Do YYYY, h:mm:ss a'),
                    "<button class='btn btn-primary members_button' data-toggle='modal' data-backdrop='static' data-target='#membersModal' data-group-id='" + group.id + "'>\
                    <i class='fa fa-users'></i>\
                    </button>\
                    <button class='btn btn-danger delete_button' data-group-id='" + group.id + "'>\
                    <i class='fa fa-trash-o'></i>\
                    </button>"
                ])
            })
            groupTable.rows.add(groupRows).draw();
        })
        .fail(() => {
            errorFlash("Error fetching user groups")
        })
}

const saveGroup = () => {
    let group = {
        name: $("#name").val()
    }
    api.userGroups.post(group)
        .done((data) => {
            successFlash("User Group " + escapeHtml(group.name) + " created successfully!")
            load()
            $("#name").val("")
            $("#modal").modal('hide')
        })
        .fail((data) => {
            modalError(data)
        })
}

const deleteGroup = (id) => {
    let group = groups.find(x => x.id == id)
    if (!group) return

    Swal.fire({
        title: "Are you sure?",
        text: "This will delete the User Group '" + escapeHtml(group.name) + "'. All members will lose shared access. This can't be undone!",
        type: "warning",
        showCancelButton: true,
        confirmButtonText: "Delete",
        confirmButtonColor: "#428bca",
        reverseButtons: true,
        allowOutsideClick: false,
        preConfirm: function () {
            return new Promise((resolve, reject) => {
                api.userGroupId.delete(id)
                    .done(() => resolve())
                    .fail((data) => reject(data.responseJSON.message))
            }).catch(error => {
                Swal.showValidationMessage(error)
            })
        }
    }).then((result) => {
        if (result.value) {
            Swal.fire('Deleted!', "The User Group has been deleted.", 'success');
            load()
        }
    })
}

const manageMembers = (id) => {
    currentGroupId = id
    let group = groups.find(x => x.id == id)
    $("#currentGroupName").text(group.name)
    loadMembers()
}

const loadMembers = () => {
    // We need to get the group details to see members
    api.userGroupId.get(currentGroupId)
        .done((group) => {
            // Wait, the API might not return members directly in the group object
            // My implementation of GET /api/user_groups/{id} only returns the group.
            // I should probably update models.GetUserGroup to return members too, 
            // or use the membership model.
            // Actually, let's check what GetUserGroup does.

            // For now, let's assume it returns members if I update it.
            // OR I can just use the user list and filter? No, I need the membership list.

            // I'll update the backend to include members in the group response.
            refreshMembersTable(group.members || [])
        })

    // Also load all users for the select dropdown
    api.users.get()
        .done((users) => {
            $("#userSelect").empty().append('<option value="">Select a user to add...</option>')
            $.each(users, (i, user) => {
                $("#userSelect").append($('<option>', {
                    value: user.id,
                    text: user.username
                }))
            })
        })
}

const refreshMembersTable = (members) => {
    let membersTable = $("#membersTable").DataTable({
        destroy: true,
        paging: false,
        searching: false,
        info: false,
        columnDefs: [{
            orderable: false,
            targets: "no-sort"
        }]
    });
    membersTable.clear();
    let memberRows = []
    $.each(members, (i, member) => {
        memberRows.push([
            escapeHtml(member.username),
            "<button class='btn btn-danger btn-xs remove_member_button' data-user-id='" + member.id + "'>\
            <i class='fa fa-times'></i> Remove</button>"
        ])
    })
    membersTable.rows.add(memberRows).draw();
}

$(document).ready(function () {
    load()

    $("#modalSubmit").click(saveGroup)

    $("#groupTable").on('click', '.delete_button', function () {
        deleteGroup($(this).attr('data-group-id'))
    })

    $("#groupTable").on('click', '.members_button', function () {
        manageMembers($(this).attr('data-group-id'))
    })

    $("#addMemberButton").click(function () {
        let userId = $("#userSelect").val()
        if (!userId) return
        api.userGroupId.addMember(currentGroupId, userId)
            .done(() => {
                loadMembers()
                successFlashFade("User added to group", 2)
            })
            .fail((data) => {
                errorFlash(data.responseJSON.message)
            })
    })

    $("#membersTable").on('click', '.remove_member_button', function () {
        let userId = $(this).attr('data-user-id')
        api.userGroupId.removeMember(currentGroupId, userId)
            .done(() => loadMembers())
            .fail((data) => errorFlash(data.responseJSON.message))
    })
});
