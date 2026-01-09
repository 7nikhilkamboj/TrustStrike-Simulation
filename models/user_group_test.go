package models

import (
	"testing"
)

func TestUserGroupSharing(t *testing.T) {
	setupTest(t)

	// Create two users
	userA := User{Username: "userA", ApiKey: "keyA", RoleID: 2} // Assuming 2 is RoleUser
	userB := User{Username: "userB", ApiKey: "keyB", RoleID: 2}
	db.Save(&userA)
	db.Save(&userB)

	// Create a User Group
	ug := UserGroup{Name: "Shared Group"}
	PostUserGroup(&ug)

	// Initially they should see themselves AND admin (1)
	uidsA, _ := GetUsersSharingWith(userA.Id)
	if len(uidsA) != 2 {
		t.Errorf("Expected userA to share with self and admin, got %v", uidsA)
	}

	// Add both to the group
	AddUserToGroup(userA.Id, ug.ID)
	AddUserToGroup(userB.Id, ug.ID)

	// User A should share with User B AND Admin (1)
	uids, _ := GetUsersSharingWith(userA.Id)
	if len(uids) != 3 {
		t.Errorf("Expected userA to share with 3 users (A, B, admin), got %v", uids)
	}

	foundB := false
	for _, id := range uids {
		if id == userB.Id {
			foundB = true
		}
	}
	if !foundB {
		t.Errorf("Expected userB to be in userA's sharing list")
	}

	// Test campaign isolation
	c := Campaign{Name: "User A Campaign", UserId: userA.Id}
	db.Save(&c)

	// User B should be able to see it because they are in the same group
	cs, _ := GetCampaigns(userB.Id, "")
	if len(cs) != 1 || cs[0].Name != "User A Campaign" {
		t.Errorf("User B should see User A's campaign via group sharing")
	}

	// Test admin global visibility
	adminUIDs, _ := GetUsersSharingWith(1)
	allUsers := []int64{}
	db.Model(&User{}).Pluck("id", &allUsers)
	if len(adminUIDs) != len(allUsers) {
		t.Errorf("Expected admin to see all %d users, got %d", len(allUsers), len(adminUIDs))
	}

	// Verify User B can see User A's campaign result (assuming results retrieval also works)
	cr, err := GetCampaignResults(c.Id, userB.Id)
	if err != nil || cr.Id != c.Id {
		t.Errorf("User B should be able to get User A's campaign results, got err: %v", err)
	}
}
