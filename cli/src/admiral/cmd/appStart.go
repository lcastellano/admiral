/*
 * Copyright (c) 2016 VMware, Inc. All Rights Reserved.
 *
 * This product is licensed to you under the Apache License, Version 2.0 (the "License").
 * You may not use this product except in compliance with the License.
 *
 * This product may include a number of subcomponents with separate copyright notices
 * and license terms. Your use of these subcomponents is subject to the terms and
 * conditions of the subcomponent's license, as noted in the LICENSE file.
 */

package cmd

import (
	"fmt"

	"admiral/apps"

	"github.com/spf13/cobra"
)

func init() {
	startAppCmd.Flags().BoolVar(&asyncTask, "async", false, asyncDesc)
	AppsRootCmd.AddCommand(startAppCmd)
}

var startAppCmd = &cobra.Command{
	Use:   "start [APPLICATION-ID]",
	Short: "Starts existing application",
	Long:  "Starts existing application",

	//Main function for "start-app" command.
	//For arguments take application names.
	//If any of the name is non-unique the command will be aborted.
	Run: func(cmd *cobra.Command, args []string) {
		var (
			IDs []string
			err error
			ok  bool
			id  string
		)
		if id, ok = ValidateArgsCount(args); !ok {
			fmt.Println("Enter application ID.")
			return
		}
		IDs, err = apps.StartAppID(id, asyncTask)

		if err != nil {
			fmt.Println(err)
		} else if len(IDs) > 0 {
			if asyncTask {
				fmt.Println("Application is being started: " + IDs[0])
			} else {
				fmt.Println("Application started: " + IDs[0])
			}
		}
	},
}